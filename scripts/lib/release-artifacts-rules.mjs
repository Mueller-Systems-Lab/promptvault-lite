// =============================================================================
// Pure rules shared by the release-artifact verifier and its tests.
//
// These live in their own module so they can be unit-tested directly: the
// verifier is a CLI that runs every check at import time and calls
// process.exit, which makes it unsuitable for importing into a test.
//
// Nothing here touches the network or the artifacts directory — each function
// takes a path or a buffer and answers one question.
// =============================================================================
import { lstatSync, readlinkSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Resolve a symlink target the way the filesystem would after extraction.
 *
 * `readlink` returns whatever string was stored. A relative target is resolved
 * against the link's own directory; an absolute target is used verbatim — and
 * that is exactly the v1.13.0/v1.13.1 `.DirIcon` defect: the stored target was
 * the *build machine's* absolute path, so after extraction it points at the
 * local filesystem instead of the tree.
 */
export function resolveLinkTarget(linkPath, target) {
  return target.startsWith("/") ? target : join(dirname(linkPath), target);
}

/**
 * True when a symlink inside a *self-contained* tree (an AppImage AppDir) is
 * not usable after extraction. That is the case when
 *
 *   - the stored target is absolute — such a link resolves against the host
 *     filesystem, never against the tree, so it is wrong even on a machine
 *     where the path happens to exist (an AppImage must not depend on the
 *     build machine); or
 *   - the (relatively) resolved target does not exist inside the tree.
 *
 * `treeRoot` is the extraction root the link belongs to; a relative target that
 * resolves outside it (via `../..`) is refused as well.
 */
export function isUnusableSymlink(linkPath, treeRoot) {
  let target;
  try {
    target = readlinkSync(linkPath);
  } catch {
    return false; // not a symlink (or unreadable): not our problem here
  }
  if (target.startsWith("/")) return true;
  const resolved = resolveLinkTarget(linkPath, target);
  // A relative escape out of the tree is as broken as an absolute link.
  const root = treeRoot.endsWith("/") ? treeRoot : `${treeRoot}/`;
  if (!resolved.startsWith(root) && resolved !== treeRoot) return true;
  try {
    statSync(resolved);
    return false;
  } catch {
    return true;
  }
}

/**
 * True when the symlink at `linkPath` does not resolve to an existing path.
 *
 * NOTE: this is *not* the AppImage rule. An absolute link whose target happens
 * to exist on the machine running the check is reported as NOT dangling, which
 * is precisely the trap the AppImage needs to avoid. Use
 * [`isUnusableSymlink`] for a self-contained tree; this helper stays for
 * contexts where only resolvability matters (e.g. a package payload whose
 * links legitimately point into system paths).
 */
export function isDanglingSymlink(linkPath) {
  let target;
  try {
    target = readlinkSync(linkPath);
  } catch {
    return false; // not a symlink (or unreadable): not our problem here
  }
  try {
    statSync(resolveLinkTarget(linkPath, target));
    return false;
  } catch {
    return true;
  }
}
/** File names that have no business inside a desktop bundle. */
export const SECRET_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".netrc",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
]);

/**
 * A private-key PEM block. File-name independent, so it also catches a key
 * that was renamed to something innocuous.
 */
export const PRIVATE_KEY_RE =
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/;

export function hasPrivateKeyBlock(content) {
  return PRIVATE_KEY_RE.test(content);
}

/** True when the file name is a credential-file name. */
export function isSecretFileName(file) {
  return SECRET_FILE_NAMES.has(basename(file).toLowerCase());
}

/** Files larger than this are never treated as plausible credential files. */
export const SECRET_SCAN_MAX_BYTES = 128 * 1024;

/** True when a file is small enough to be content-scanned for a key block. */
export function isScannableForSecrets(file) {
  try {
    const st = lstatSync(file);
    return st.isFile() && st.size > 0 && st.size < SECRET_SCAN_MAX_BYTES;
  } catch {
    return false;
  }
}
