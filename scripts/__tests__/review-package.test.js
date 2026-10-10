// Privacy-boundary regression + mutation tests for the canonical review-package
// builder. The default package must contain TRACKED repository state only;
// untracked private corpora (.env, Promps/, credentials, arbitrary files) must
// never enter it, and a symlink escaping the root must abort the run.
//
// Run: pnpm vitest run scripts/__tests__/review-package.test.js
// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  classifyPaths,
  createReviewPackage,
  isRestrictedPath,
  loadRestrictedGlobs,
} from "../create-review-package.mjs";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..", "..");
const TOOL = join(REPO_ROOT, "scripts/create-review-package.mjs");
const scratch = mkdtempSync(join(tmpdir(), "pvl-review-package-"));
let sequence = 0;

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
}

function makeRepo() {
  const root = join(scratch, `repo-${sequence++}`);
  mkdirSync(root, { recursive: true });
  git(["init", "--quiet"], root);
  git(["config", "user.name", "Review Package Test"], root);
  git(["config", "user.email", "review-package@example.invalid"], root);
  git(["remote", "add", "origin", "git@github.com:Mueller-Systems-Lab/promptvault-lite.git"], root);
  mkdirSync(join(root, ".agents/schemas"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "fixture project instructions\n");
  for (const rel of [
    ".opencode/spec", ".opencode/specs", "docs/specs", ".agents/skills", "src",
    "tests", "src-tauri/tests", "crates", "scripts/__tests__",
    "tools/promptvault-cli/tests", "evidence", ".opencode/reports",
  ]) mkdirSync(join(root, rel), { recursive: true });
  copyFileSync(
    join(REPO_ROOT, ".agents/project-contract.v1.json"),
    join(root, ".agents/project-contract.v1.json")
  );
  copyFileSync(
    join(REPO_ROOT, ".agents/schemas/project-contract.v1.schema.json"),
    join(root, ".agents/schemas/project-contract.v1.schema.json")
  );
  return root;
}

/** A minimal ustar reader so the test never shells out to `tar`. */
function readTarEntries(buffer) {
  const entries = [];
  let offset = 0;
  const text = (buf, start, len) => buf.toString("utf8", start, start + len).replace(/\0.*$/, "").trim();
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = text(header, 0, 100);
    const prefix = text(header, 345, 155);
    const size = parseInt(text(header, 124, 12) || "0", 8);
    const typeflag = header.toString("ascii", 156, 157);
    const linkname = text(header, 157, 100);
    const content = buffer.subarray(offset + 512, offset + 512 + size).toString("utf8");
    entries.push({ name: prefix ? `${prefix}/${name}` : name, typeflag, linkname, content });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function readTar(buffer) {
  return readTarEntries(buffer).map((entry) => entry.name);
}

function runCli(root, args = []) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: root, encoding: "utf8" });
}

function seedFixture(root) {
  // tracked, safe
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/app.ts"), "export const app = 1;\n");
  writeFileSync(join(root, "README.md"), "# fixture\n");
  writeFileSync(join(root, ".env.example"), "API_KEY=\n");
  // tracked, restricted-by-content (proves the filter is not the untracked rule)
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config/credentials"), "synthetic-placeholder\n");
  // untracked, private
  mkdirSync(join(root, "Promps"), { recursive: true });
  writeFileSync(join(root, "Promps/private.md"), "PRIVATE_CORPUS_SENTINEL\n");
  writeFileSync(join(root, ".env"), "SECRET_SENTINEL=1\n");
  writeFileSync(join(root, "random.txt"), "ARBITRARY_SENTINEL\n");

  git(["add", "--", ".agents", "AGENTS.md", "src", "README.md", ".env.example"], root);
  git(["commit", "--quiet", "-m", "fixture"], root);
  // Track the restricted file too, so restricted-TRACKED exclusion is exercised.
  git(["add", "--", "config/credentials"], root);
  git(["commit", "--quiet", "-m", "track restricted fixture"], root);
}

describe("review-package privacy boundary", () => {
  it("excludes Promps/, .env, credentials and arbitrary untracked files, and includes safe tracked files", () => {
    const root = makeRepo();
    seedFixture(root);
    const result = createReviewPackage({ cwd: root, outDir: join(root, "..", `out-${sequence++}`) });
    const entries = readTar(gunzipSync(readFileSync(result.archivePath)));

    expect(entries).toContain("src/app.ts");
    expect(entries).toContain("README.md");
    expect(entries).toContain("inventory.json");
    expect(entries).toContain("MANIFEST.sha256");

    for (const forbidden of ["Promps/private.md", ".env", "config/credentials", "random.txt"]) {
      expect(entries, `${forbidden} must not be packaged`).not.toContain(forbidden);
    }
    expect(result.inventory.workspace.restricted_untracked).toContainEqual({
      root: "Promps/",
      untracked_count: 1,
      tracked_excluded_count: 0,
      included: false,
    });
    expect(result.inventory.package.excluded_restricted_tracked).toContain("config/credentials");
    expect(result.inventory.head).toMatch(/^[0-9a-f]{40}$/); // no trailing newline (F4)
  });

  it("classifies an intentionally tracked .env.example as example-config and still includes it", () => {
    const root = makeRepo();
    seedFixture(root);
    const result = createReviewPackage({ cwd: root, outDir: join(root, "..", `out-${sequence++}`) });
    const entries = readTar(gunzipSync(readFileSync(result.archivePath)));
    expect(entries).toContain(".env.example");
    expect(result.inventory.package.example_config_classified).toContain(".env.example");
  });

  it("reports untracked and restricted material by count only, never by private name", () => {
    const root = makeRepo();
    seedFixture(root);
    const result = createReviewPackage({ cwd: root, outDir: join(root, "..", `out-${sequence++}`) });
    const serialized = JSON.stringify(result.inventory);
    expect(serialized).not.toContain("private.md");
    expect(serialized).not.toContain("PRIVATE_CORPUS_SENTINEL");
    expect(serialized).not.toContain("random.txt");
    expect(result.inventory.workspace.untracked_path_count).toBeGreaterThanOrEqual(3);
  });

  it("produces a deterministic archive (identical bytes for identical input)", () => {
    const root = makeRepo();
    seedFixture(root);
    const first = createReviewPackage({ cwd: root, outDir: join(root, "..", `det-a-${sequence++}`) });
    const second = createReviewPackage({ cwd: root, outDir: join(root, "..", `det-b-${sequence++}`) });
    expect(first.archiveSha256).toBe(second.archiveSha256);
  });

  it("refuses to package a restricted path even when explicitly allowlisted", () => {
    const root = makeRepo();
    seedFixture(root);
    expect(() =>
      createReviewPackage({
        cwd: root,
        allowUntracked: ["Promps/private.md"],
        authorizedUntracked: true,
        purpose: "mutation attempt",
      })
    ).toThrow(/RESTRICTED_PATH_REFUSED/);
  });

  it("requires explicit authorization before any untracked path may be included", () => {
    const root = makeRepo();
    seedFixture(root);
    expect(() => createReviewPackage({ cwd: root, allowUntracked: ["random.txt"] })).toThrow(
      /UNTRACKED_INCLUSION_NOT_AUTHORIZED/
    );
    const authorized = createReviewPackage({
      cwd: root,
      outDir: join(root, "..", `auth-${sequence++}`),
      allowUntracked: ["random.txt"],
      authorizedUntracked: true,
      purpose: "documented synthetic case",
    });
    const entries = readTar(gunzipSync(readFileSync(authorized.archivePath)));
    expect(entries).toContain("random.txt");
    expect(entries).not.toContain("Promps/private.md");
  });

  it("aborts when a symlink escapes the repository root", () => {
    const root = makeRepo();
    seedFixture(root);
    const outside = join(scratch, `outside-${sequence++}`);
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "escape.md"), "OUTSIDE_SENTINEL\n");
    try {
      symlinkSync(outside, join(root, "escape-link"), "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return; // host cannot symlink
      throw error;
    }
    // Track the escaping symlink so it becomes a packaging candidate.
    git(["add", "--", "escape-link"], root);
    git(["commit", "--quiet", "-m", "track escaping symlink"], root);
    expect(() => createReviewPackage({ cwd: root, outDir: join(root, "..", `esc-${sequence++}`) })).toThrow(
      /SYMLINK_ESCAPES_REPOSITORY/
    );
  });

  it("CLI exits 0 on a clean tracked-only run and prints an archive hash", () => {
    const root = makeRepo();
    seedFixture(root);
    const out = join(root, "..", `cli-${sequence++}`);
    const result = runCli(root, ["--out", out, "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.package.included).toContain("src/app.ts");
  });
});

describe("review-package hostile-input regressions", () => {
  function trySymlink(target, linkPath) {
    try {
      symlinkSync(target, linkPath);
      return true;
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return false;
      throw error;
    }
  }

  it("does not leak content through a tracked symlink to a restricted tracked file", (context) => {
    const root = makeRepo();
    mkdirSync(join(root, "Promps"), { recursive: true });
    writeFileSync(join(root, "Promps/private.md"), "PRIVATE_CORPUS_SENTINEL\n");
    writeFileSync(join(root, "README.md"), "# fixture\n");
    if (!trySymlink("Promps/private.md", join(root, "leak"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "Promps/private.md", "leak"], root);
    git(["commit", "--quiet", "-m", "tracked restricted + symlink"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `sym-a-${sequence++}`) });
    const raw = gunzipSync(readFileSync(result.archivePath));
    expect(raw.toString("utf8")).not.toContain("PRIVATE_CORPUS_SENTINEL");
    expect(readTar(raw)).not.toContain("leak");
    expect(result.inventory.package.symlink_excluded.map((e) => e.path)).toContain("leak");
  });

  it("does not leak content through a tracked symlink to an untracked file", (context) => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    writeFileSync(join(root, "secret-notes.md"), "ARBITRARY_UNTRACKED_SENTINEL\n");
    if (!trySymlink("secret-notes.md", join(root, "peek"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "peek"], root);
    git(["commit", "--quiet", "-m", "tracked symlink to untracked file"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `sym-b-${sequence++}`) });
    const raw = gunzipSync(readFileSync(result.archivePath));
    expect(raw.toString("utf8")).not.toContain("ARBITRARY_UNTRACKED_SENTINEL");
    expect(readTar(raw)).not.toContain("peek");
    expect(readTar(raw)).not.toContain("secret-notes.md");
  });

  it("records an inside-root symlink as a link target path, never as content", (context) => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "README_TARGET_SENTINEL\n");
    if (!trySymlink("README.md", join(root, "link-to-readme"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "link-to-readme"], root);
    git(["commit", "--quiet", "-m", "tracked inside-root symlink"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `sym-c-${sequence++}`) });
    const entries = readTarEntries(gunzipSync(readFileSync(result.archivePath)));
    const link = entries.find((entry) => entry.name === "link-to-readme");
    expect(link).toBeDefined();
    expect(link.typeflag).toBe("2"); // a symlink entry
    expect(link.linkname).toBe("README.md"); // the target PATH, not its content
    expect(link.content).not.toContain("README_TARGET_SENTINEL");
  });

  it("refuses a path that cannot be represented exactly in ustar (no silent truncation)", () => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    const deepDir = "a".repeat(200);
    mkdirSync(join(root, deepDir), { recursive: true });
    writeFileSync(join(root, deepDir, "b".repeat(20)), "content\n");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", deepDir], root);
    git(["commit", "--quiet", "-m", "long path"], root);
    expect(() => createReviewPackage({ cwd: root, outDir: join(scratch, `long-${sequence++}`) })).toThrow(/TAR_NAME_TOO_LONG/);
  });

  it("excludes a backslash path instead of aliasing or duplicating an entry", () => {
    const root = makeRepo();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/app.ts"), "REAL_APP\n");
    writeFileSync(join(root, "src\\app.ts"), "BACKSLASH_IMPOSTOR\n"); // legal filename on Linux
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "src/app.ts", "src\\app.ts"], root);
    git(["commit", "--quiet", "-m", "backslash path"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `bs-${sequence++}`) });
    const entries = readTarEntries(gunzipSync(readFileSync(result.archivePath)));
    const appEntries = entries.filter((entry) => entry.name === "src/app.ts");
    expect(appEntries).toHaveLength(1); // no duplicate
    expect(appEntries[0].content).toBe("REAL_APP\n"); // the impostor did not win
    expect(result.inventory.package.excluded_unrepresentable).toContain("src\\app.ts");
  });

  it("refuses a symlink whose target path is too long for ustar (no dangling link)", (context) => {
    const root = makeRepo();
    const dir = "d".repeat(60);
    const file = `${"f".repeat(60)}.md`;
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, file), "target\n");
    if (!trySymlink(`${dir}/${file}`, join(root, "deep-link"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", dir, "deep-link"], root);
    git(["commit", "--quiet", "-m", "long symlink target"], root);
    expect(() => createReviewPackage({ cwd: root, outDir: join(scratch, `sl-${sequence++}`) })).toThrow(/TAR_NAME_TOO_LONG/);
  });

  it("drops a symlink chain that would dangle (a -> b -> restricted)", (context) => {
    const root = makeRepo();
    mkdirSync(join(root, "Promps"), { recursive: true });
    writeFileSync(join(root, "Promps/private.md"), "PRIVATE_CORPUS_SENTINEL\n");
    writeFileSync(join(root, "README.md"), "# fixture\n");
    if (!trySymlink("Promps/private.md", join(root, "b"))) return context.skip("host cannot symlink");
    if (!trySymlink("b", join(root, "a"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "Promps/private.md", "a", "b"], root);
    git(["commit", "--quiet", "-m", "symlink chain"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `chain-${sequence++}`) });
    const raw = gunzipSync(readFileSync(result.archivePath));
    const names = readTar(raw);
    expect(names).not.toContain("a"); // no dangling link
    expect(names).not.toContain("b");
    expect(raw.toString("utf8")).not.toContain("PRIVATE_CORPUS_SENTINEL");
    expect(result.inventory.package.symlink_excluded.map((e) => e.path).sort()).toEqual(["a", "b"]);
  });

  it("records an inside-root symlink with a relative target, never the local absolute path", (context) => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    if (!trySymlink(join(root, "README.md"), join(root, "abs-link"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "abs-link"], root);
    git(["commit", "--quiet", "-m", "absolute symlink target"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `abs-${sequence++}`) });
    const raw = gunzipSync(readFileSync(result.archivePath));
    const link = readTarEntries(raw).find((entry) => entry.name === "abs-link");
    expect(link.linkname).toBe("README.md");
    expect(raw.toString("utf8")).not.toContain(root); // no local absolute layout in the archive
  });

  it("refuses to allowlist an unrepresentable untracked path", () => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    writeFileSync(join(root, "bs\\name.txt"), "x\n");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md"], root);
    git(["commit", "--quiet", "-m", "base"], root);
    expect(() =>
      createReviewPackage({
        cwd: root,
        allowUntracked: ["bs\\name.txt"],
        authorizedUntracked: true,
        purpose: "probe",
      })
    ).toThrow(/ALLOWLIST_PATH_UNREPRESENTABLE/);
  });

  it("never emits a restricted symlink target NAME in the inventory", (context) => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    if (!trySymlink("Promps/highly-confidential-thing.md", join(root, "leak"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "leak"], root);
    git(["commit", "--quiet", "-m", "symlink to restricted name"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `n1-${sequence++}`) });
    const serialized = JSON.stringify(result.inventory);
    expect(serialized).not.toContain("highly-confidential-thing"); // no target name
    expect(result.inventory.package.symlink_excluded).toContainEqual({ path: "leak", target_kind: "restricted" });
    expect(readTar(gunzipSync(readFileSync(result.archivePath)))).not.toContain("leak");
  });

  it("labels a symlink to the bare restricted directory as restricted, not not-packaged", (context) => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    if (!trySymlink("Promps", join(root, "dirlink"))) return context.skip("host cannot symlink");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "dirlink"], root);
    git(["commit", "--quiet", "-m", "symlink to bare restricted dir"], root);

    const result = createReviewPackage({ cwd: root, outDir: join(scratch, `bare-${sequence++}`) });
    expect(result.inventory.package.symlink_excluded).toContainEqual({ path: "dirlink", target_kind: "restricted" });
  });

  it("refuses a tracked path that collides with the generated metadata names", () => {
    const root = makeRepo();
    writeFileSync(join(root, "README.md"), "# fixture\n");
    writeFileSync(join(root, "inventory.json"), "{\"impostor\":true}\n");
    git(["--literal-pathspecs", "add", "--", ".agents", "AGENTS.md", "README.md", "inventory.json"], root);
    git(["commit", "--quiet", "-m", "reserved name collision"], root);
    expect(() => createReviewPackage({ cwd: root, outDir: join(scratch, `n2-${sequence++}`) })).toThrow(/RESERVED_NAME_COLLISION/);
  });
});

describe("review-package mutation probe (the guard is load-bearing)", () => {
  it("fails the exclusion assertion when the restricted filter is weakened", () => {
    const root = makeRepo();
    const restrictedGlobs = loadRestrictedGlobs(root);
    const tracked = ["Promps/private.md", "src/app.ts"];

    // Sanity: with the real filter, Promps/ is excluded.
    const real = classifyPaths({ tracked, restrictedGlobs });
    expect(real.included).toContain("src/app.ts");
    expect(real.included).not.toContain("Promps/private.md");

    // Mutation: weaken the filter exactly as a broken implementation would.
    const weakened = classifyPaths({ tracked, restrictedGlobs: [] });

    // The same safety assertion must now FAIL — proving it is not vacuous.
    expect(() => {
      expect(weakened.included).not.toContain("Promps/private.md");
    }).toThrow();
    // …and the weakened run really did leak the restricted path.
    expect(weakened.included).toContain("Promps/private.md");
  });

  it("treats .env as restricted but .env.example as packageable", () => {
    const root = makeRepo();
    const globs = loadRestrictedGlobs(root);
    expect(isRestrictedPath(".env", globs)).toBe(true);
    expect(isRestrictedPath("deploy/.env.production", globs)).toBe(true);
    expect(isRestrictedPath("config/credentials", globs)).toBe(true);
    expect(isRestrictedPath("Promps/private.md", globs)).toBe(true);
    expect(isRestrictedPath(".env.example", globs)).toBe(false);
    expect(isRestrictedPath("src/app.ts", globs)).toBe(false);
  });
});
