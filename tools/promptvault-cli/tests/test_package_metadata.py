"""Package metadata assertions for the renamed PyPI distribution.

The PyPI distribution name is ``promptvault-lite-manager`` while the import
package stays ``promptvault_cli`` and the executable stays ``promptvault``.

Version contract: instead of embedding a hardcoded release number, the
version assertions compare the two canonical version sources against each
other:

- ``pyproject.toml`` -> ``project.version``
- ``src/promptvault_cli/__init__.py`` -> ``__version__``

A future version bump therefore never requires editing this test file,
while any real drift between the two sources still fails the suite.
"""

import json
import re
import tomllib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
_PACKAGE_VERSION_RE = re.compile(r'__version__\s*=\s*"([^"]+)"')


def _pyproject_version() -> str:
    with open(PROJECT_ROOT / "pyproject.toml", "rb") as f:
        return tomllib.load(f)["project"]["version"]


def _package_version() -> str:
    text = (PROJECT_ROOT / "src" / "promptvault_cli" / "__init__.py").read_text()
    match = _PACKAGE_VERSION_RE.search(text)
    if not match:
        raise AssertionError("__version__ not found in promptvault_cli/__init__.py")
    return match.group(1)


def test_distribution_name_is_promptvault_lite_manager() -> None:
    pyproject = (PROJECT_ROOT / "pyproject.toml").read_text()
    assert 'name = "promptvault-lite-manager"' in pyproject


def test_pyproject_version_matches_package_version() -> None:
    """Both canonical version sources must agree.

    Detects package-version drift in either direction:
    - pyproject bumped without updating ``__version__`` -> FAIL
    - ``__version__`` bumped without updating pyproject -> FAIL
    No stale release literal lives in this test.
    """
    assert _pyproject_version() == _package_version()


def test_checked_in_release_manifest_matches_package_version() -> None:
    """The checked-in release manifest must track the package version.

    Closes the release-drift hole where pyproject.toml and ``__init__.py``
    are bumped but the release manifest is forgotten: a stale manifest
    would make ``promptvault install`` fail closed at runtime (the
    original v1.11.0 incident class). No stale release literal lives here —
    the expected values are read from the canonical ``__init__.py``
    version via ``_package_version()``, so any real manifest-vs-package
    drift fails the suite.
    """
    manifest_path = PROJECT_ROOT / "promptvault-release-manifest.json"
    manifest = json.loads(manifest_path.read_text())

    assert manifest["version"] == _package_version()

    artifacts = manifest["artifacts"]
    assert len(artifacts) == 1
    entry = next(iter(artifacts.values()))

    assert _package_version() in entry["filename"]
    assert f"v{_package_version()}" in entry["url"]
    assert re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])
    assert isinstance(entry["size"], int) and entry["size"] > 0
    assert entry["type"] == "nsis"


def test_executable_entry_point_unchanged() -> None:
    pyproject = (PROJECT_ROOT / "pyproject.toml").read_text()
    assert 'promptvault = "promptvault_cli.cli:main"' in pyproject


def test_readme_has_public_install_command() -> None:
    readme = (PROJECT_ROOT / "README.md").read_text()
    assert "uv tool install promptvault-lite-manager" in readme
    for command in ("promptvault --version", "promptvault doctor",
                    "promptvault install", "promptvault launch"):
        assert command in readme


def test_readme_has_no_stale_publication_wording() -> None:
    readme = (PROJECT_ROOT / "README.md").read_text()
    stale = ("not yet published", "pending a package-index", "pending publication",
             "uv install unavailable", "locally built wheel")
    for phrase in stale:
        assert phrase.lower() not in readme.lower()
