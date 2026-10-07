#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_RELATIVE = ".agents/project-contract.v1.json";
const SCHEMA_RELATIVE = ".agents/schemas/project-contract.v1.schema.json";
const SKIP_DIRS = new Set([
  ".git", ".aws", "Promps", "node_modules", "target", "dist", "build",
  ".cache", ".tmp", ".playwright-mcp", "coverage",
]);

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "git command failed").trim();
    throw new Error(`GIT_PREFLIGHT_FAILED: ${detail}`);
  }
}

function within(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function safeRelativePath(path) {
  if (typeof path !== "string" || !path || path.includes("\0") || path.includes("\\") || isAbsolute(path) || win32.isAbsolute(path)) return false;
  return !path.split(/[\\/]+/).some((segment) => segment === ".." || segment === ".");
}

function normalizeRemote(remote) {
  let host;
  let pathname;
  const scp = remote.match(/^(?:[^@/]+@)?([^:]+):(.+)$/);
  if (scp && !remote.includes("://")) {
    [, host, pathname] = scp;
    const username = remote.slice(0, remote.indexOf("@"));
    if (username !== "git" || host.toLowerCase() !== "github.com") {
      throw new Error("ORIGIN_IDENTITY_MISMATCH: SSH origin must use git@github.com");
    }
  } else {
    let parsed;
    try {
      parsed = new URL(remote);
    } catch {
      throw new Error("ORIGIN_IDENTITY_MISMATCH: unsupported origin URL form");
    }
    const validHttps = parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port;
    const validSsh = parsed.protocol === "ssh:" && parsed.username === "git" && !parsed.password && (!parsed.port || parsed.port === "22");
    if ((!validHttps && !validSsh) || parsed.hostname.toLowerCase() !== "github.com" || parsed.search || parsed.hash) {
      throw new Error("ORIGIN_IDENTITY_MISMATCH: origin URL contains disallowed URL components");
    }
    host = parsed.hostname;
    pathname = parsed.pathname;
  }
  const parts = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
  if (!host || parts.length !== 2 || parts.some((part) => !part)) {
    throw new Error("ORIGIN_IDENTITY_MISMATCH: origin does not identify one owner/repository pair");
  }
  return `${host.toLowerCase()}/${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
}

function schemaErrors(value, schema, pointer = "$", rootSchema = schema) {
  const errors = [];
  if (schema.$ref) {
    const target = schema.$ref.split("/").slice(1).reduce((node, key) => node?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
    if (!target) return [`${pointer}: unresolved schema reference ${schema.$ref}`];
    return schemaErrors(value, target, pointer, rootSchema);
  }
  const types = {
    object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    array: Array.isArray,
    string: (v) => typeof v === "string",
    boolean: (v) => typeof v === "boolean",
  };
  if (schema.type && !types[schema.type]?.(value)) return [`${pointer}: expected ${schema.type}`];
  if (Object.hasOwn(schema, "const") && value !== schema.const) errors.push(`${pointer}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${pointer}: value is not in the allowed set`);
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) errors.push(`${pointer}: string is too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${pointer}: string does not match required pattern`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errors.push(`${pointer}: array has too few entries`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${pointer}: array entries must be unique`);
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, `${pointer}[${index}]`, rootSchema)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push(`${pointer}: missing required property ${required}`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[key];
      if (!childSchema) {
        if (schema.additionalProperties === false) errors.push(`${pointer}: unexpected property ${key}`);
      } else errors.push(...schemaErrors(child, childSchema, `${pointer}.${key}`, rootSchema));
    }
  }
  return errors;
}

function assertSupportedSchema(schema, pointer = "$schema") {
  const supported = new Set([
    "$schema", "$id", "title", "$defs", "$ref", "type", "const", "enum",
    "minLength", "pattern", "minItems", "uniqueItems", "items", "required",
    "properties", "additionalProperties",
  ]);
  for (const [key, value] of Object.entries(schema)) {
    if (!supported.has(key)) throw new Error(`SCHEMA_UNSUPPORTED_KEYWORD: ${pointer}.${key}`);
    if (key === "properties" || key === "$defs") {
      for (const [childKey, child] of Object.entries(value)) assertSupportedSchema(child, `${pointer}.${key}.${childKey}`);
    } else if (key === "items") assertSupportedSchema(value, `${pointer}.items`);
    else if (key === "additionalProperties" && typeof value !== "boolean") {
      throw new Error(`SCHEMA_UNSUPPORTED_KEYWORD: ${pointer}.additionalProperties must be boolean`);
    }
  }
}

function readJson(realFile, label) {
  try {
    return JSON.parse(readFileSync(realFile, "utf8"));
  } catch (error) {
    throw new Error(`${label}_INVALID: ${error.message}`);
  }
}

function discoverNestedGitRoots(root) {
  const found = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const gitMarker = join(fullPath, ".git");
      if (existsSync(gitMarker)) {
        found.push(fullPath);
      } else if (!entry.isSymbolicLink()) {
        walk(fullPath);
      }
    }
  }
  walk(root);
  return found;
}

function validateNestedRoots(root, contract) {
  const declarations = new Map(contract.workspacePolicy.nestedRoots.map((entry) => [entry.path.replaceAll("\\", "/"), entry]));
  const markers = discoverNestedGitRoots(root);
  for (const nestedPath of markers) {
    const rel = relative(root, nestedPath).split(sep).join("/");
    const declaration = declarations.get(rel);
    if (!declaration) throw new Error(`UNDECLARED_NESTED_PROJECT_ROOT: ${rel}`);
    const nestedRoot = realpathSync(nestedPath);
    const reportedRoot = realpathSync(git(["-C", nestedPath, "rev-parse", "--show-toplevel"], root));
    if (reportedRoot !== nestedRoot) throw new Error(`NESTED_ROOT_PATH_MISMATCH: ${rel}`);
    if (declaration.kind === "worktree") {
      const mainCommon = realpathSync(resolve(root, git(["rev-parse", "--git-common-dir"], root)));
      const nestedCommonRaw = git(["-C", nestedPath, "rev-parse", "--git-common-dir"], root);
      const nestedCommon = realpathSync(resolve(nestedPath, nestedCommonRaw));
      if (mainCommon !== nestedCommon) throw new Error(`NESTED_WORKTREE_NOT_LINKED: ${rel}`);
    } else if (declaration.kind === "submodule") {
      const index = git(["ls-files", "--stage", "--", rel], root);
      if (!index.split("\n").some((line) => line.startsWith("160000 "))) {
        throw new Error(`DECLARED_SUBMODULE_NOT_IN_INDEX: ${rel}`);
      }
    } else {
      throw new Error(`NESTED_GIT_ROOT_KIND_INVALID: ${rel} is a Git root but declared as ${declaration.kind}`);
    }
    declarations.delete(rel);
  }
  for (const [rel, declaration] of declarations) {
    if (!safeRelativePath(rel)) throw new Error(`NESTED_ROOT_PATH_ESCAPE: ${rel}`);
    const declaredPath = resolve(root, rel);
    if (!within(root, declaredPath)) throw new Error(`NESTED_ROOT_PATH_ESCAPE: ${rel}`);
    if (!existsSync(declaredPath)) throw new Error(`DECLARED_NESTED_ROOT_MISSING: ${rel}`);
    if (!within(root, realpathSync(declaredPath))) throw new Error(`NESTED_ROOT_PATH_SYMLINK_ESCAPE: ${rel}`);
    if (["worktree", "submodule"].includes(declaration.kind)) {
      throw new Error(`DECLARED_NESTED_GIT_ROOT_MISSING: ${rel}`);
    }
  }
}

function globToRegExp(glob, caseInsensitive = false) {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      pattern += ".*";
      index += 1;
    } else if (char === "*") pattern += "[^/]*";
    else pattern += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${pattern}$`, caseInsensitive ? "i" : "");
}

function resolveWriteTarget(root, requested) {
  if (!safeRelativePath(requested)) throw new Error("WRITE_PATH_DENIED: path must be a safe repository-relative path");
  const target = resolve(root, requested);
  if (!within(root, target)) throw new Error("WRITE_PATH_DENIED: path escapes repository root");
  let cursor = root;
  for (const segment of requested.split("/")) {
    cursor = join(cursor, segment);
    try {
      if (lstatSync(cursor).isSymbolicLink()) {
        throw new Error("WRITE_PATH_DENIED: symlink path components are not allowed");
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  let ancestor = target;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("WRITE_PATH_DENIED: no existing path ancestor");
    ancestor = parent;
  }
  const realAncestor = realpathSync(ancestor);
  if (!within(root, realAncestor)) throw new Error("WRITE_PATH_DENIED: symlink ancestor escapes repository root");
  return requested.replaceAll("\\", "/");
}

function evaluateWritePath(root, contract, requested) {
  const normalizedPath = resolveWriteTarget(root, requested);
  const restricted = contract.writePolicy.restricted.some((pattern) => globToRegExp(pattern, true).test(normalizedPath));
  const permitted = contract.writePolicy.permitted.some((pattern) => globToRegExp(pattern).test(normalizedPath));
  return { allowed: permitted && !restricted, normalizedPath, reason: restricted ? "restricted-pattern" : permitted ? "permitted-pattern" : "outside-permitted-patterns" };
}

export function validateWritePath({ cwd = process.cwd(), expectedRoot, path }) {
  const context = validateProjectContext({ cwd, expectedRoot });
  const contract = readJson(join(context.root, CONTRACT_RELATIVE), "CONTRACT");
  return evaluateWritePath(context.root, contract, path);
}

export function validateProjectContext({ cwd = process.cwd(), expectedRoot } = {}) {
  let start;
  try {
    start = realpathSync(cwd);
  } catch {
    throw new Error("WRONG_ROOT: starting directory does not exist");
  }
  let gitRoot;
  try {
    gitRoot = realpathSync(git(["-C", start, "rev-parse", "--show-toplevel"], start));
  } catch {
    throw new Error("WRONG_ROOT: starting directory is not inside a Git worktree");
  }
  if (expectedRoot) {
    let expected;
    try { expected = realpathSync(expectedRoot); }
    catch { throw new Error("WRONG_ROOT: expected root does not exist"); }
    if (expected !== gitRoot) throw new Error("WRONG_ROOT: resolved Git root differs from expected root");
  }

  const contractPath = join(gitRoot, CONTRACT_RELATIVE);
  const schemaPath = join(gitRoot, SCHEMA_RELATIVE);
  if (!existsSync(contractPath)) throw new Error(`CONTRACT_MISSING: ${CONTRACT_RELATIVE}`);
  if (!existsSync(schemaPath)) throw new Error(`SCHEMA_MISSING: ${SCHEMA_RELATIVE}`);
  const resolvedContract = realpathSync(contractPath);
  const resolvedSchema = realpathSync(schemaPath);
  if (!within(gitRoot, resolvedContract) || !within(gitRoot, resolvedSchema)) {
    throw new Error("CONTRACT_PATH_SYMLINK_ESCAPE: contract or schema resolves outside repository root");
  }
  if (lstatSync(contractPath).isSymbolicLink() && !within(gitRoot, resolvedContract)) {
    throw new Error("CONTRACT_PATH_SYMLINK_ESCAPE: contract symlink resolves outside repository root");
  }

  const schema = readJson(resolvedSchema, "SCHEMA");
  const contract = readJson(resolvedContract, "CONTRACT");
  assertSupportedSchema(schema);
  const violations = schemaErrors(contract, schema);
  if (violations.length) throw new Error(`CONTRACT_SCHEMA_INVALID: ${violations.join("; ")}`);

  const origin = git(["-C", gitRoot, "remote", "get-url", "origin"], gitRoot);
  const identity = normalizeRemote(origin);
  const canonicalIdentity = `${contract.project.provider === "github" ? "github.com" : contract.project.provider}/${contract.project.owner}/${contract.project.repository}`.toLowerCase();
  const canonicalRemotes = contract.project.canonicalRemotes.map(normalizeRemote);
  const forkIdentities = contract.project.approvedForks.map((fork) => ({
    identity: `github.com/${fork.owner}/${fork.repository}`.toLowerCase(),
    remotes: fork.canonicalRemotes.map(normalizeRemote),
  }));
  const selectedIdentity = identity === canonicalIdentity
    ? { identity: canonicalIdentity, remotes: canonicalRemotes }
    : forkIdentities.find((fork) => fork.identity === identity);
  if (!selectedIdentity) throw new Error("ORIGIN_IDENTITY_MISMATCH: origin is neither canonical nor an approved fork");
  if (!selectedIdentity.remotes.includes(identity)) throw new Error("ORIGIN_NOT_CANONICAL: origin identity is not listed as an approved remote");

  const mappedPaths = [contract.paths.instructions, ...contract.paths.specs, ...contract.paths.skills, ...contract.paths.tests, ...contract.paths.evidence];
  for (const rel of mappedPaths) {
    if (!safeRelativePath(rel)) throw new Error(`PATH_MAP_ESCAPE: ${rel}`);
    const resolvedPath = resolve(gitRoot, rel);
    if (!within(gitRoot, resolvedPath)) throw new Error(`PATH_MAP_ESCAPE: ${rel}`);
    if (!existsSync(resolvedPath)) throw new Error(`PATH_MAP_MISSING: ${rel}`);
    if (!within(gitRoot, realpathSync(resolvedPath))) throw new Error(`PATH_MAP_SYMLINK_ESCAPE: ${rel}`);
  }
  for (const rel of [...contract.writePolicy.permitted, ...contract.writePolicy.restricted]) {
    if (!safeRelativePath(rel)) throw new Error(`WRITE_POLICY_PATH_INVALID: ${rel}`);
  }

  validateNestedRoots(gitRoot, contract);
  return {
    status: "VALIDATOR_AVAILABLE",
    root: gitRoot,
    identity,
    defaultBranch: contract.project.defaultBranch,
    contractVersion: contract.contractVersion,
    nestedRoots: contract.workspacePolicy.nestedRoots.map(({ path, kind }) => ({ path, kind })),
    enforcement: contract.enforcementEvidence,
  };
}

function cli(argv) {
  let expectedRoot;
  let checkWrite;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--expected-root") expectedRoot = argv[++index];
    else if (argv[index] === "--check-write") {
      checkWrite = argv[++index];
      if (!checkWrite || checkWrite.startsWith("--")) throw new Error("--check-write requires a repository-relative path");
    }
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  const result = validateProjectContext({ cwd: process.cwd(), expectedRoot });
  console.log(`PROJECT_CONTRACT=PASS version=${result.contractVersion}`);
  console.log(`PROJECT_IDENTITY=${result.identity}`);
  console.log(`CONTRACT_VALIDATION=${result.status}`);
  console.log(`WRITE_PATH_POLICY_VALIDATOR=${result.enforcement.writePathPolicyValidator}`);
  console.log(`WRITE_BOUNDARY_ENFORCEMENT=${result.enforcement.writeBoundaryEnforcement}`);
  console.log(`POLICY_DOCUMENTATION=${result.enforcement.repositoryInstructions}`);
  console.log(`HOOK_ENFORCEMENT=${result.enforcement.preCommitHook}`);
  console.log(`BROKER_ENFORCEMENT=${result.enforcement.writeBroker}`);
  console.log(`GLOBAL_OPENCODE=${result.enforcement.globalOpenCodeRuntime}`);
  if (checkWrite) {
    const check = evaluateWritePath(result.root, readJson(join(result.root, CONTRACT_RELATIVE), "CONTRACT"), checkWrite);
    console.log(`WRITE_PATH=${check.allowed ? "ALLOWED" : "DENIED"} reason=${check.reason}`);
    if (!check.allowed) process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); }
  catch (error) {
    console.error(`PROJECT_CONTRACT=FAIL ${error.message}`);
    process.exitCode = 1;
  }
}
