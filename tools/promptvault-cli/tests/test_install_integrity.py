"""Orchestration tests: the installer must never run after a validation failure."""

import hashlib
import json
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import pytest  # noqa: E402

from promptvault_cli.platform import platform_tag  # noqa: E402


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _valid_manifest(data: bytes = b"payload", **entry_overrides) -> dict:
    entry = {
        "filename": "setup.exe",
        "type": "nsis",
        "sha256": _sha(data),
        "size": len(data),
    }
    entry.update(entry_overrides)
    return {
        "schema_version": 1,
        "version": "1.9.1",
        "artifacts": {platform_tag(): entry},
    }


def _write_manifest(tmp_path: Path, manifest: dict) -> Path:
    path = tmp_path / "promptvault-release-manifest.json"
    path.write_text(json.dumps(manifest))
    return path


def _patched_install(manifest_path: Path, artifact_data: bytes):
    """Run install_cmd.run_install with a fixed local manifest and a
    mocked subprocess, os_name and install detection. Returns the mocked
    subprocess module."""
    from promptvault_cli import install_cmd

    subprocess_mock = mock.MagicMock()
    subprocess_mock.run = mock.MagicMock(return_value=mock.MagicMock(returncode=0))

    with mock.patch.object(install_cmd, "os_name", return_value="windows"), \
         mock.patch.object(install_cmd, "find_manifest", return_value=manifest_path), \
         mock.patch.object(install_cmd, "find_install_path", return_value=None), \
         mock.patch.object(install_cmd, "find_executable", return_value=None), \
         mock.patch.object(install_cmd, "write_installed_version"), \
         mock.patch.object(install_cmd, "subprocess", subprocess_mock):
        with pytest.raises(SystemExit):
            install_cmd.run_install()
    return subprocess_mock


def test_installer_not_invoked_on_missing_sha256(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    del manifest["artifacts"][platform_tag()]["sha256"]
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_not_invoked_on_missing_size(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    del manifest["artifacts"][platform_tag()]["size"]
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_not_invoked_on_missing_type(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    del manifest["artifacts"][platform_tag()]["type"]
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_not_invoked_on_missing_filename(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    del manifest["artifacts"][platform_tag()]["filename"]
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_not_invoked_on_missing_version(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    del manifest["version"]
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_not_invoked_on_version_mismatch(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    manifest["version"] = "1.9.0"
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_not_invoked_on_unsupported_platform(tmp_path: Path) -> None:
    manifest = _valid_manifest()
    manifest["artifacts"] = {"linux-aarch64": manifest["artifacts"][platform_tag()]}
    path = _write_manifest(tmp_path, manifest)
    sub = _patched_install(path, b"payload")
    sub.run.assert_not_called()


def test_installer_invoked_on_valid_artifact(tmp_path: Path) -> None:
    data = b"payload"
    artifact = tmp_path / "setup.exe"
    artifact.write_bytes(data)
    manifest = _valid_manifest(data=data)
    path = _write_manifest(tmp_path, manifest)

    from promptvault_cli import install_cmd

    subprocess_mock = mock.MagicMock()
    subprocess_mock.run = mock.MagicMock(return_value=mock.MagicMock(returncode=0))

    with mock.patch.object(install_cmd, "os_name", return_value="windows"), \
         mock.patch.object(install_cmd, "find_manifest", return_value=path), \
         mock.patch.object(install_cmd, "find_artifact_dir", return_value=tmp_path), \
         mock.patch.object(install_cmd, "find_install_path", return_value=None), \
         mock.patch.object(install_cmd, "find_executable", return_value=None), \
         mock.patch.object(install_cmd, "write_installed_version"), \
         mock.patch.object(install_cmd, "subprocess", subprocess_mock):
        install_cmd.run_install()
    subprocess_mock.run.assert_called_once()
