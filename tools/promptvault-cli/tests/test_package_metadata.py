"""Package metadata assertions for the renamed PyPI distribution.

The PyPI distribution name is ``promptvault-lite-manager`` while the import
package stays ``promptvault_cli`` and the executable stays ``promptvault``.
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_distribution_name_is_promptvault_lite_manager() -> None:
    pyproject = (PROJECT_ROOT / "pyproject.toml").read_text()
    assert 'name = "promptvault-lite-manager"' in pyproject


def test_version_is_1_9_0() -> None:
    pyproject = (PROJECT_ROOT / "pyproject.toml").read_text()
    assert 'version = "1.9.0"' in pyproject


def test_executable_entry_point_unchanged() -> None:
    pyproject = (PROJECT_ROOT / "pyproject.toml").read_text()
    assert 'promptvault = "promptvault_cli.cli:main"' in pyproject


def test_import_package_name_unchanged() -> None:
    init = (PROJECT_ROOT / "src" / "promptvault_cli" / "__init__.py").read_text()
    assert "__version__ = \"1.9.0\"" in init
