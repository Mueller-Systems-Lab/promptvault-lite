"""Tests for release manifest resolution and artifact verification."""

import hashlib
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from promptvault_cli import releases  # noqa: E402


def test_verify_artifact_hash_match(tmp_path: Path) -> None:
    data = b"promptvault test artifact content"
    path = tmp_path / "artifact.exe"
    path.write_bytes(data)
    sha = hashlib.sha256(data).hexdigest()
    entry = {"filename": "artifact.exe", "sha256": sha, "size": len(data)}
    assert releases.verify_artifact(path, entry) is True


def test_verify_artifact_hash_mismatch_raises(tmp_path: Path) -> None:
    data = b"promptvault test artifact content"
    path = tmp_path / "artifact.exe"
    path.write_bytes(data)
    entry = {
        "filename": "artifact.exe",
        "sha256": "0" * 64,
        "size": len(data),
    }
    try:
        releases.verify_artifact(path, entry)
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError as e:
        assert "integrity check FAILED" in str(e)


def test_verify_artifact_size_mismatch_raises(tmp_path: Path) -> None:
    data = b"short"
    path = tmp_path / "artifact.exe"
    path.write_bytes(data)
    entry = {"filename": "artifact.exe", "sha256": None, "size": 99999}
    try:
        releases.verify_artifact(path, entry)
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError:
        pass


def test_verify_artifact_missing_raises(tmp_path: Path) -> None:
    path = tmp_path / "missing.exe"
    entry = {"filename": "missing.exe", "sha256": None}
    try:
        releases.verify_artifact(path, entry)
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError as e:
        assert "not found" in str(e)


def test_load_manifest_rejects_bad_schema() -> None:
    try:
        releases.load_manifest(json.dumps({"schema_version": 999}))
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError:
        pass


def test_resolve_artifact_for_platform() -> None:
    manifest = {
        "schema_version": 1,
        "version": "1.9.0",
        "artifacts": {
            "windows-x86_64": {
                "filename": "setup.exe",
                "sha256": "abc",
                "size": 1,
            }
        },
    }
    filename, entry = releases.resolve_artifact(manifest)
    assert filename.name == "setup.exe"


def test_resolve_artifact_unsupported_platform() -> None:
    manifest = {
        "schema_version": 1,
        "version": "1.8.0",
        "artifacts": {"linux-aarch64": {"filename": "x"}},
    }
    try:
        releases.resolve_artifact(manifest)
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError as e:
        assert "No artifact for platform" in str(e)


def test_load_manifest_rejects_unsupported_installer_type() -> None:
    manifest = {
        "schema_version": 1,
        "version": "1.9.0",
        "artifacts": {
            "windows-x86_64": {"filename": "setup.exe", "type": "pkg"}
        },
    }
    try:
        releases.load_manifest(json.dumps(manifest))
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError as e:
        assert "unsupported installer type" in str(e)


def test_load_manifest_accepts_supported_installer_types() -> None:
    for t in ("nsis", "msi"):
        manifest = {
            "schema_version": 1,
            "version": "1.9.0",
            "artifacts": {
                "windows-x86_64": {"filename": "setup.exe", "type": t}
            },
        }
        loaded = releases.load_manifest(json.dumps(manifest))
        assert loaded["artifacts"]["windows-x86_64"]["type"] == t


def test_release_manifest_url_is_deterministic() -> None:
    url = releases.release_manifest_url("1.9.0")
    assert url.endswith("/v1.9.0/promptvault-release-manifest.json")
    assert "releases/download" in url


def test_artifact_download_url_prefers_explicit_url() -> None:
    entry = {
        "filename": "setup.exe",
        "url": "https://example.com/setup.exe",
    }
    assert releases.artifact_download_url("1.9.0", entry) == "https://example.com/setup.exe"


def test_artifact_download_url_derives_fallback() -> None:
    entry = {"filename": "setup.exe"}
    url = releases.artifact_download_url("1.9.0", entry)
    assert url.endswith("/v1.9.0/setup.exe")
    assert "releases/download" in url
