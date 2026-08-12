"""Doctor — System and installation health check."""

import os
import sys
import platform as _platform
from pathlib import Path

from promptvault_cli.platform import os_name, arch, platform_tag

APP_VERSION = "1.9.0"


def find_install_path() -> Path | None:
    local_appdata = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
    candidates = [
        local_appdata / "PromptVault Lite",
        local_appdata / "Programs" / "PromptVault Lite",
        local_appdata / "promptvault",
        Path("C:/Program Files/PromptVault Lite"),
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def find_executable(install_path: Path | None) -> Path | None:
    if not install_path:
        return None
    for exe_name in ("PromptVault Lite.exe", "promptvault-lite.exe", "promptvault.exe"):
        candidate = install_path / exe_name
        if candidate.exists():
            return candidate
    for item in install_path.rglob("*.exe"):
        name = item.name.lower()
        if "promptvault" in name or "prompt vault" in name:
            return item
    return None


def run_doctor() -> None:
    results: list[tuple[str, str, str]] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        status = "PASS" if ok else "FAIL"
        results.append((label, status, detail))

    def warn(label: str, detail: str = "") -> None:
        results.append((label, "WARN", detail))

    check("CLI version", True, APP_VERSION)
    check(
        "Python version",
        True,
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    )
    check("OS", True, _platform.system())
    check("Architecture", True, arch())
    check("Platform tag", True, platform_tag())

    install_path = find_install_path()
    if install_path:
        check("Install location", True, str(install_path))
        exe = find_executable(install_path)
        if exe:
            check("Native executable", True, str(exe))
            check("Native app installed", True, "Detected")
        else:
            check("Native executable", False, "No executable found in install path")
            check("Native app installed", False, "Install dir exists but no executable")
    else:
        warn("Native app installed", "Not detected — run 'promptvault install'")

    # Check uv tool environment
    bin_path = Path.home() / ".local" / "bin"
    if bin_path.exists():
        check("uv tool path", True, str(bin_path))
    else:
        warn("uv tool path", "uv tool directory not found")

    check("Diagnostics support", True, "Admin Observability in-app")

    print()
    print("=" * 60)
    print("  PROMPTVAULT DOCTOR")
    print("=" * 60)
    for label, status, detail in results:
        print(f"  [{status}] {label}" + (f": {detail}" if detail else ""))

    total = len(results)
    passed = sum(1 for _, s, _ in results if s == "PASS")
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    warned = sum(1 for _, s, _ in results if s == "WARN")
    print("-" * 60)
    print(f"  {passed} PASS, {failed} FAIL, {warned} WARN, {total} TOTAL")
    if failed > 0:
        print("  Run 'promptvault install' if the native app is missing.")
    print("=" * 60)
    print()
