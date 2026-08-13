"""Tests for release manifest resolution and artifact verification."""

import hashlib
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import pytest  # noqa: E402

from promptvault_cli import releases  # noqa: E402
from promptvault_cli.platform import platform_tag  # noqa: E402


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _entry(data: bytes = b"x", **overrides) -> dict:
    entry = {
        "filename": "setup.exe",
        "type": "nsis",
        "sha256": _sha(data),
        "size": len(data),
    }
    entry.update(overrides)
    return entry


def _manifest(version: str = "1.9.1", entry: dict | None = None) -> dict:
    return {
        "schema_version": 1,
        "version": version,
        "artifacts": {
            platform_tag(): entry if entry is not None else _entry(),
        },
    }


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
    entry = {"filename": "artifact.exe", "sha256": _sha(data), "size": 99999}
    try:
        releases.verify_artifact(path, entry)
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError:
        pass


def test_verify_artifact_missing_raises(tmp_path: Path) -> None:
    path = tmp_path / "missing.exe"
    entry = {"filename": "missing.exe", "sha256": _sha(b"x")}
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


def test_load_manifest_rejects_malformed_json() -> None:
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest("{ not json }")


def test_load_manifest_rejects_non_object() -> None:
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(["not", "an", "object"]))


def test_resolve_artifact_for_platform() -> None:
    manifest = {
        "schema_version": 1,
        "version": "1.9.0",
        "artifacts": {
            platform_tag(): {
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
            "windows-x86_64": _entry(type="pkg"),
        },
    }
    try:
        releases.load_manifest(json.dumps(manifest))
        raise AssertionError("expected ArtifactIntegrityError")
    except releases.ArtifactIntegrityError as e:
        assert "unsupported installer type" in str(e)


def test_load_manifest_accepts_supported_installer_types() -> None:
    for t in ("nsis", "msi"):
        manifest = _manifest(entry=_entry(type=t))
        loaded = releases.load_manifest(json.dumps(manifest))
        assert loaded["artifacts"][platform_tag()]["type"] == t


# ── Structural validation must be fail-closed ──────────────────────────


def test_load_manifest_rejects_missing_version() -> None:
    manifest = _manifest()
    del manifest["version"]
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_invalid_version() -> None:
    manifest = _manifest(version="not-a-version")
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_missing_sha256() -> None:
    manifest = _manifest(entry=_entry())
    del manifest["artifacts"][platform_tag()]["sha256"]
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_empty_sha256() -> None:
    manifest = _manifest(entry=_entry(sha256=""))
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_malformed_sha256() -> None:
    manifest = _manifest(entry=_entry(sha256="zz" * 32))
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_missing_size() -> None:
    manifest = _manifest(entry=_entry())
    del manifest["artifacts"][platform_tag()]["size"]
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_zero_size() -> None:
    manifest = _manifest(entry=_entry(size=0))
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_negative_size() -> None:
    manifest = _manifest(entry=_entry(size=-5))
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_missing_filename() -> None:
    manifest = _manifest(entry=_entry())
    del manifest["artifacts"][platform_tag()]["filename"]
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_unsafe_filename() -> None:
    for filename in ("../escape.exe", "sub/dir.exe", "C:\\abs\\x.exe", ".", ".."):
        manifest = _manifest(entry=_entry(filename=filename))
        with pytest.raises(releases.ArtifactIntegrityError):
            releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_missing_type() -> None:
    manifest = _manifest(entry=_entry())
    del manifest["artifacts"][platform_tag()]["type"]
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_non_string_type() -> None:
    manifest = _manifest(entry=_entry(type=["nsis"]))
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.load_manifest(json.dumps(manifest))


def test_load_manifest_rejects_malformed_url() -> None:
    for url in ("", "file:///etc/passwd", "ftp://example.com/a.exe",
                "not-a-url", "C:\\x\\y.exe", "http://example.com/a.exe"):
        manifest = _manifest(entry=_entry(url=url))
        with pytest.raises(releases.ArtifactIntegrityError):
            releases.load_manifest(json.dumps(manifest))


def test_load_manifest_accepts_valid_https_url() -> None:
    url = "https://github.com/example/releases/download/v1.9.1/setup.exe"
    manifest = _manifest(entry=_entry(url=url))
    loaded = releases.load_manifest(json.dumps(manifest))
    assert loaded["artifacts"][platform_tag()]["url"] == url


def test_load_manifest_accepts_fully_valid_manifest() -> None:
    manifest = _manifest()
    loaded = releases.load_manifest(json.dumps(manifest))
    assert loaded["version"] == "1.9.1"


# ── Version contract ───────────────────────────────────────────────────


def test_validate_manifest_version_mismatch_raises() -> None:
    manifest = _manifest(version="1.9.0")
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.validate_manifest_version(manifest, "1.9.1")


def test_validate_manifest_version_match_ok() -> None:
    manifest = _manifest(version="1.9.1")
    releases.validate_manifest_version(manifest, "1.9.1")


# ── verify_artifact defense-in-depth ───────────────────────────────────


def test_verify_artifact_missing_hash_raises(tmp_path: Path) -> None:
    data = b"content"
    path = tmp_path / "a.exe"
    path.write_bytes(data)
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.verify_artifact(path, {"filename": "a.exe", "size": len(data)})


def test_verify_artifact_missing_size_raises(tmp_path: Path) -> None:
    data = b"content"
    path = tmp_path / "a.exe"
    path.write_bytes(data)
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.verify_artifact(path, {"filename": "a.exe", "sha256": _sha(data)})


def test_verify_artifact_tampered_after_download_raises(tmp_path: Path) -> None:
    data = b"original payload"
    path = tmp_path / "a.exe"
    path.write_bytes(data)
    entry = {"filename": "a.exe", "sha256": _sha(data), "size": len(data)}
    path.write_bytes(b"tampered payload that differs in length")
    with pytest.raises(releases.ArtifactIntegrityError):
        releases.verify_artifact(path, entry)


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
