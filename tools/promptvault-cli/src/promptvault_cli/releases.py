"""Release manifest resolution and artifact verification.

The installer uses a machine-readable manifest to resolve the correct
native artifact for the current platform and verify its integrity.
Fail-closed: any hash/version/platform mismatch aborts installation.

The manifest may be resolved locally (``PROMPTVAULT_MANIFEST`` or a manifest
file in the CWD / ``~/.promptvault``) or fetched from the canonical public
GitHub Release (``fetch_remote_manifest``). Remote artifacts are downloaded
into a controlled cache directory and verified (size + SHA-256) before use.
"""

import json
import hashlib
import os
import shutil
import urllib.request
from pathlib import Path

from promptvault_cli.platform import platform_tag, os_name, arch

RELEASE_MANIFEST_VERSION = 1

RELEASE_OWNER = "xxammaxx"
RELEASE_REPO = "promptvault-lite"
RELEASE_MANIFEST_FILENAME = "promptvault-release-manifest.json"
RELEASE_BASE_URL = (
    f"https://github.com/{RELEASE_OWNER}/{RELEASE_REPO}/releases/download"
)

SUPPORTED_INSTALLER_TYPES = {"nsis", "msi"}

MANIFEST_ENV_VAR = "PROMPTVAULT_MANIFEST"
ARTIFACT_DIR_ENV_VAR = "PROMPTVAULT_ARTIFACT_DIR"

CACHE_DIR = Path.home() / ".promptvault" / "downloads"


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
    if "artifacts" not in manifest or not isinstance(manifest["artifacts"], dict):
        raise ArtifactIntegrityError("Manifest missing 'artifacts'")

    for tag, entry in manifest["artifacts"].items():
        if not isinstance(entry, dict) or not entry.get("filename"):
            raise ArtifactIntegrityError(f"Artifact '{tag}' missing 'filename'")
        installer_type = entry.get("type", "nsis")
        if installer_type not in SUPPORTED_INSTALLER_TYPES:
            raise ArtifactIntegrityError(
                f"Artifact '{tag}' has unsupported installer type '{installer_type}'"
            )
    return manifest


def release_manifest_url(version: str) -> str:
    """Deterministic public URL of the release manifest for a version."""
    version = version.lstrip("v")
    return f"{RELEASE_BASE_URL}/v{version}/{RELEASE_MANIFEST_FILENAME}"


def artifact_download_url(version: str, entry: dict) -> str:
    """Resolve the public download URL for a manifest artifact.

    Prefers an explicit ``url`` in the entry; otherwise derives the
    deterministic GitHub Release asset URL from the release version and the
    asset filename (documented convention, not a heuristic).
    """
    if entry.get("url"):
        return entry["url"]
    version = version.lstrip("v")
    filename = entry["filename"]
    return f"{RELEASE_BASE_URL}/v{version}/{filename}"


def _download(url: str, dest: Path, timeout: int = 60) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "promptvault-cli",
            "Accept": "application/octet-stream",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        with open(dest, "wb") as out:
            shutil.copyfileobj(resp, out)


def fetch_remote_manifest(version: str) -> Path:
    """Download the public release manifest for a version into the cache.

    Raises :class:`ArtifactIntegrityError` when the download fails.
    """
    url = release_manifest_url(version)
    cache = CACHE_DIR / version.lstrip("v")
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / RELEASE_MANIFEST_FILENAME
    try:
        _download(url, dest)
    except Exception as e:
        raise ArtifactIntegrityError(
            f"Could not download release manifest from {url}: {e}"
        ) from e
    return dest


def download_artifact(version: str, entry: dict, dest_dir: Path) -> Path:
    """Download the manifest-selected artifact into ``dest_dir``.

    The caller is responsible for verifying size and SHA-256 afterwards.
    Raises :class:`ArtifactIntegrityError` when the download fails.
    """
    filename = entry["filename"]
    url = artifact_download_url(version, entry)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    try:
        _download(url, dest)
    except Exception as e:
        raise ArtifactIntegrityError(
            f"Could not download artifact from {url}: {e}"
        ) from e
    return dest


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
