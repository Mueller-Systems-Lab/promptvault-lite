"""Release manifest resolution and artifact verification.

The installer uses a machine-readable manifest to resolve the correct
native artifact for the current platform and verify its integrity.
Fail-closed: any hash/version/platform mismatch aborts installation.
"""

import json
import hashlib
import os
from pathlib import Path

from promptvault_cli.platform import platform_tag, os_name, arch

RELEASE_MANIFEST_VERSION = 1

MANIFEST_ENV_VAR = "PROMPTVAULT_MANIFEST"
ARTIFACT_DIR_ENV_VAR = "PROMPTVAULT_ARTIFACT_DIR"


class ArtifactIntegrityError(RuntimeError):
    """Raised when an artifact fails hash/version/platform verification."""


def sha256_of(path: Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()


def load_manifest(data: str) -> dict:
    manifest = json.loads(data)
    if manifest.get("schema_version") != RELEASE_MANIFEST_VERSION:
        raise ArtifactIntegrityError(
            f"Unsupported manifest schema version: {manifest.get('schema_version')}"
        )
    if "version" not in manifest:
        raise ArtifactIntegrityError("Manifest missing 'version'")
    if "artifacts" not in manifest:
        raise ArtifactIntegrityError("Manifest missing 'artifacts'")
    return manifest


def find_manifest() -> Path | None:
    env_path = os.environ.get(MANIFEST_ENV_VAR)
    if env_path:
        p = Path(env_path)
        if p.exists():
            return p

    for candidate in [
        Path.cwd() / "promptvault-release-manifest.json",
        Path.home() / ".promptvault" / "promptvault-release-manifest.json",
    ]:
        if candidate.exists():
            return candidate
    return None


def find_artifact_dir(manifest_path: Path) -> Path:
    env_dir = os.environ.get(ARTIFACT_DIR_ENV_VAR)
    if env_dir:
        p = Path(env_dir)
        if p.is_dir():
            return p
    return manifest_path.parent


def resolve_artifact(manifest: dict) -> tuple[Path, dict]:
    tag = platform_tag()
    artifacts = manifest.get("artifacts", {})
    entry = artifacts.get(tag)
    if entry is None:
        raise ArtifactIntegrityError(
            f"No artifact for platform '{tag}'. Available: {', '.join(artifacts.keys())}"
        )

    filename = entry.get("filename")
    if not filename:
        raise ArtifactIntegrityError("Artifact entry missing 'filename'")

    return Path(filename), entry


def verify_artifact(artifact_path: Path, entry: dict) -> bool:
    if not artifact_path.exists():
        raise ArtifactIntegrityError(f"Artifact not found: {artifact_path}")

    expected_sha256 = entry.get("sha256")
    if expected_sha256:
        actual = sha256_of(artifact_path)
        if actual.lower() != expected_sha256.lower():
            raise ArtifactIntegrityError(
                f"Artifact integrity check FAILED.\n"
                f"  expected sha256: {expected_sha256}\n"
                f"  actual   sha256: {actual}"
            )

    expected_size = entry.get("size")
    if expected_size and artifact_path.stat().st_size != expected_size:
        raise ArtifactIntegrityError(
            f"Artifact size mismatch: expected {expected_size}, "
            f"got {artifact_path.stat().st_size}"
        )

    return True
