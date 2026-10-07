import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { validateProjectContext, validateWritePath } from "../../tools/validate-project-contract.mjs";

const sourceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "pvl-project-contract-"));
let sequence = 0;

after(() => rmSync(scratch, { recursive: true, force: true }));

function command(args, cwd, options = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore", ...options });
}

function makeRepo({ remote = "git@github.com:Mueller-Systems-Lab/promptvault-lite.git", contract = true } = {}) {
  const root = join(scratch, `repo-${sequence++}`);
  mkdirSync(root, { recursive: true });
  command(["init", "--quiet"], root);
  command(["config", "user.name", "Contract Test"], root);
  command(["config", "user.email", "contract-test@example.invalid"], root);
  command(["remote", "add", "origin", remote], root);
  if (contract) writeContract(root);
  return root;
}

function writeContract(root, mutate = (value) => value) {
  const contractPath = join(root, ".agents/project-contract.v1.json");
  mkdirSync(join(root, ".agents/schemas"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "fixture project instructions\n");
  for (const rel of [
    ".opencode/spec", ".opencode/specs", "docs/specs", ".agents/skills", "src",
    "tests", "src-tauri/tests", "crates", "scripts/__tests__",
    "tools/promptvault-cli/tests", "evidence", ".opencode/reports",
  ]) mkdirSync(join(root, rel), { recursive: true });
  const contract = mutate(JSON.parse(readFileSync(join(sourceRoot, ".agents/project-contract.v1.json"), "utf8")));
  writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  copyFileSync(
    join(sourceRoot, ".agents/schemas/project-contract.v1.schema.json"),
    join(root, ".agents/schemas/project-contract.v1.schema.json")
  );
  return contractPath;
}

function commitAll(root, message = "fixture") {
  command(["add", "-A"], root);
  command(["commit", "--quiet", "-m", message], root);
}

describe("PromptVault Lite project contract", () => {
  it("rejects a wrong root outside any Git worktree", () => {
    const outside = join(scratch, `outside-${sequence++}`);
    mkdirSync(outside);
    assert.throws(() => validateProjectContext({ cwd: outside }), /WRONG_ROOT/);
  });

  it("rejects a Git repository with a different project identity", () => {
    const root = makeRepo({ remote: "https://github.com/example/other-project.git" });
    assert.throws(() => validateProjectContext({ cwd: root }), /ORIGIN_IDENTITY_MISMATCH/);
  });

  it("accepts a fork only when the contract explicitly approves its identity and remote", () => {
    const root = makeRepo({ remote: "git@github.com:approved-owner/promptvault-lite.git", contract: false });
    writeContract(root, (contract) => {
      contract.project.approvedForks = [{
        owner: "approved-owner",
        repository: "promptvault-lite",
        canonicalRemotes: [
          "https://github.com/approved-owner/promptvault-lite.git",
          "git@github.com:approved-owner/promptvault-lite.git",
        ],
      }];
      return contract;
    });
    assert.equal(validateProjectContext({ cwd: root }).identity, "github.com/approved-owner/promptvault-lite");
  });

  it("rejects HTTP, foreign-user, foreign-host, and nonstandard-port origin forms", () => {
    const remotes = [
      "http://github.com/Mueller-Systems-Lab/promptvault-lite.git",
      "https://alice@github.com/Mueller-Systems-Lab/promptvault-lite.git",
      "https://github.com:8443/Mueller-Systems-Lab/promptvault-lite.git",
      "ssh://alice@github.com/Mueller-Systems-Lab/promptvault-lite.git",
      "git@not-github.com:Mueller-Systems-Lab/promptvault-lite.git",
    ];
    for (const remote of remotes) {
      const root = makeRepo({ remote });
      assert.throws(() => validateProjectContext({ cwd: root }), /ORIGIN_IDENTITY_MISMATCH/);
    }
  });

  it("rejects a missing contract", () => {
    const root = makeRepo({ contract: false });
    assert.throws(() => validateProjectContext({ cwd: root }), /CONTRACT_MISSING/);
  });

  it("rejects a contract symlink that escapes the resolved repository root", (context) => {
    const root = makeRepo({ contract: false });
    const outside = join(scratch, `outside-contract-${sequence++}.json`);
    mkdirSync(join(root, ".agents/schemas"), { recursive: true });
    copyFileSync(join(sourceRoot, ".agents/schemas/project-contract.v1.schema.json"), join(root, ".agents/schemas/project-contract.v1.schema.json"));
    writeFileSync(outside, readFileSync(join(sourceRoot, ".agents/project-contract.v1.json")));
    try {
      symlinkSync(outside, join(root, ".agents/project-contract.v1.json"));
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        context.skip(`host cannot create symlinks: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.throws(() => validateProjectContext({ cwd: root }), /CONTRACT_PATH_SYMLINK_ESCAPE/);
  });

  it("rejects an undeclared duplicate nested repository", () => {
    const root = makeRepo();
    const nested = join(root, "examples/duplicate");
    mkdirSync(nested, { recursive: true });
    command(["init", "--quiet"], nested);
    command(["remote", "add", "origin", "https://github.com/Mueller-Systems-Lab/promptvault-lite.git"], nested);
    assert.throws(() => validateProjectContext({ cwd: root }), /UNDECLARED_NESTED_PROJECT_ROOT/);
  });

  it("detects an undeclared nested repository under the ignored .worktrees path", () => {
    const root = makeRepo();
    const nested = join(root, ".worktrees/duplicate");
    mkdirSync(nested, { recursive: true });
    command(["init", "--quiet"], nested);
    command(["remote", "add", "origin", "https://github.com/Mueller-Systems-Lab/promptvault-lite.git"], nested);
    assert.throws(() => validateProjectContext({ cwd: root }), /UNDECLARED_NESTED_PROJECT_ROOT/);
  });

  it("allows a declared ordinary module without nested Git metadata", () => {
    const root = makeRepo({ contract: false });
    mkdirSync(join(root, "crates/example-module"), { recursive: true });
    writeContract(root, (contract) => {
      contract.workspacePolicy.nestedRoots = [{ path: "crates/example-module", kind: "module" }];
      return contract;
    });
    assert.equal(validateProjectContext({ cwd: root }).status, "VALIDATOR_AVAILABLE");
  });

  it("allows a declared linked worktree", () => {
    const root = makeRepo({ contract: false });
    writeContract(root, (contract) => {
      contract.workspacePolicy.nestedRoots = [{ path: "workspaces/linked", kind: "worktree" }];
      return contract;
    });
    commitAll(root);
    mkdirSync(join(root, "workspaces"), { recursive: true });
    command(["worktree", "add", "--quiet", "workspaces/linked", "-b", "contract-fixture-worktree"], root);
    assert.equal(validateProjectContext({ cwd: root }).status, "VALIDATOR_AVAILABLE");
  });

  it("rejects a nested clone falsely declared as a linked worktree", () => {
    const root = makeRepo({ contract: false });
    const nested = join(root, "workspaces/unlinked");
    mkdirSync(nested, { recursive: true });
    writeContract(root, (contract) => {
      contract.workspacePolicy.nestedRoots = [{ path: "workspaces/unlinked", kind: "worktree" }];
      return contract;
    });
    command(["init", "--quiet"], nested);
    command(["remote", "add", "origin", "https://github.com/Mueller-Systems-Lab/promptvault-lite.git"], nested);
    assert.throws(() => validateProjectContext({ cwd: root }), /NESTED_WORKTREE_NOT_LINKED/);
  });

  it("allows a declared real submodule", () => {
    const root = makeRepo({ contract: false });
    const submoduleSource = join(scratch, `submodule-source-${sequence++}`);
    mkdirSync(submoduleSource, { recursive: true });
    command(["init", "--quiet"], submoduleSource);
    command(["config", "user.name", "Contract Test"], submoduleSource);
    command(["config", "user.email", "contract-test@example.invalid"], submoduleSource);
    writeFileSync(join(submoduleSource, "README.md"), "synthetic module fixture\n");
    command(["add", "README.md"], submoduleSource);
    command(["commit", "--quiet", "-m", "fixture"], submoduleSource);
    writeContract(root, (contract) => {
      contract.workspacePolicy.nestedRoots = [{ path: "vendor/submodule", kind: "submodule" }];
      return contract;
    });
    command(["-c", "protocol.file.allow=always", "submodule", "add", submoduleSource, "vendor/submodule"], root);
    command(["add", "-A"], root);
    assert.equal(validateProjectContext({ cwd: root }).status, "VALIDATOR_AVAILABLE");
  });

  it("re-resolves repository identity and root after a repository switch", () => {
    const first = makeRepo();
    const second = makeRepo();
    const firstResult = validateProjectContext({ cwd: first });
    const secondResult = validateProjectContext({ cwd: second });
    assert.notEqual(firstResult.root, secondResult.root);
    assert.equal(secondResult.identity, "github.com/mueller-systems-lab/promptvault-lite");
    assert.equal(secondResult.root, second);
    const switchedProject = makeRepo({ remote: "https://github.com/example/other-project.git" });
    assert.throws(() => validateProjectContext({ cwd: switchedProject }), /ORIGIN_IDENTITY_MISMATCH/);
  });

  it("rejects a caller-supplied expected root that differs from the resolved Git root", () => {
    const root = makeRepo();
    const other = join(scratch, `expected-${sequence++}`);
    mkdirSync(other);
    assert.throws(() => validateProjectContext({ cwd: root, expectedRoot: other }), /WRONG_ROOT/);
  });

  it("uses schema constraints to reject unsupported contract versions", () => {
    const root = makeRepo({ contract: false });
    writeContract(root, (contract) => ({ ...contract, contractVersion: "2.0.0" }));
    assert.throws(() => validateProjectContext({ cwd: root }), /CONTRACT_SCHEMA_INVALID/);
  });

  it("rejects Windows absolute paths, backslashes, and parent traversal in the schema", () => {
    const badPaths = ["C:\\outside", "folder\\outside", "../outside"];
    for (const path of badPaths) {
      const root = makeRepo({ contract: false });
      writeContract(root, (contract) => {
        contract.paths.specs = [path];
        return contract;
      });
      assert.throws(() => validateProjectContext({ cwd: root }), /CONTRACT_SCHEMA_INVALID/);
    }
  });

  it("checks write paths deterministically and keeps restricted paths denied", () => {
    const root = makeRepo();
    assert.deepEqual(validateWritePath({ cwd: root, path: "docs/new-guide.md" }), {
      allowed: true,
      normalizedPath: "docs/new-guide.md",
      reason: "permitted-pattern",
    });
    assert.equal(validateWritePath({ cwd: root, path: "Promps/private.md" }).allowed, false);
    assert.throws(() => validateWritePath({ cwd: root, path: "../outside.md" }), /WRITE_PATH_DENIED/);
    for (const path of [".dockerignore", "Cargo.toml", "Cargo.lock", "pnpm-lock.yaml"]) {
      assert.equal(validateWritePath({ cwd: root, path }).allowed, true, `${path} should be a permitted root file`);
    }
    for (const path of ["deploy/.env", "deploy/.ENV", "deploy/secrets/.env.local", "deploy/secrets/.ENV.local"]) {
      assert.equal(validateWritePath({ cwd: root, path }).allowed, false, `${path} must stay restricted`);
    }
    for (const path of [".opencode/spec/adr/new.md", ".opencode/specs/new-spec.md"]) {
      assert.equal(validateWritePath({ cwd: root, path }).allowed, true, `${path} is a documented spec path`);
    }
    const cli = spawnSync(process.execPath, [
      join(sourceRoot, "tools/validate-project-contract.mjs"),
      "--check-write", "docs/new-guide.md",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(cli.status, 0);
    assert.match(cli.stdout, /WRITE_PATH=ALLOWED reason=permitted-pattern/);
    const restrictedEnv = spawnSync(process.execPath, [
      join(sourceRoot, "tools/validate-project-contract.mjs"),
      "--check-write", "deploy/.ENV",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(restrictedEnv.status, 2);
    assert.match(restrictedEnv.stdout, /WRITE_PATH=DENIED reason=restricted-pattern/);
  });

  it("denies a write path whose existing parent symlink escapes the repository", (context) => {
    const root = makeRepo();
    const outside = join(scratch, `outside-write-${sequence++}`);
    mkdirSync(outside);
    try {
      symlinkSync(outside, join(root, "linked-outside"), "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        context.skip(`host cannot create symlinks: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.throws(() => validateWritePath({ cwd: root, path: "linked-outside/new.md" }), /WRITE_PATH_DENIED/);
  });

  it("denies an in-repository symlink that aliases a restricted corpus root", (context) => {
    const root = makeRepo();
    mkdirSync(join(root, "Promps"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    try {
      symlinkSync("../Promps", join(root, "docs/corpus"), "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        context.skip(`host cannot create symlinks: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.equal(validateWritePath({ cwd: root, path: "Promps/private.md" }).allowed, false);
    assert.throws(() => validateWritePath({ cwd: root, path: "docs/corpus/private.md" }), /WRITE_PATH_DENIED: symlink path components/);
  });
});
