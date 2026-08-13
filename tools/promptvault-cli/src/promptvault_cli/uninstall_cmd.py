"""Uninstall — Remove the native PromptVault app (keeps vault data)."""

import sys
import shutil
import subprocess
from pathlib import Path

from promptvault_cli.doctor import find_install_path


def run_uninstall() -> None:
    print("PromptVault Uninstaller")
    print("-" * 40)

    install_path = find_install_path()
    if not install_path:
        print("[INFO] PromptVault is not installed.")
        print("       Nothing to uninstall.")
        return

    print(f"[INFO] Install location: {install_path}")
    print("[INFO] Your vault data (prompt files, analyses) will NOT be deleted.")

    # Prefer the app's own uninstaller if present.
    uninstaller = install_path / "Uninstall PromptVault Lite.exe"
    if not uninstaller.exists():
        uninstaller = next(install_path.rglob("Uninstall*.exe"), None)

    if uninstaller:
        print(f"[INFO] Found uninstaller: {uninstaller}")
        response = input("Proceed with uninstall? [y/N] ").strip().lower()
        if response not in ("y", "yes"):
            print("Uninstall cancelled.")
            return
        try:
            subprocess.run([str(uninstaller), "/S"], check=False)
        except Exception as e:
            print(f"[FAIL] Could not run uninstaller: {e}")
            sys.exit(1)
    else:
        print("[WARN] No uninstaller found. Will remove install directory.")
        response = input("Proceed with uninstall? [y/N] ").strip().lower()
        if response not in ("y", "yes"):
            print("Uninstall cancelled.")
            return
        try:
            shutil.rmtree(install_path)
        except Exception as e:
            print(f"[FAIL] Could not remove installation: {e}")
            sys.exit(1)

    if install_path.exists():
        print("[WARN] Install directory still present (may need manual cleanup).")
        print(f"       {install_path}")
    else:
        print(f"[OK] Removed: {install_path}")

    print("[INFO] The CLI itself was not removed.")
    print("       To remove the CLI: uv tool uninstall promptvault-lite-manager")


if __name__ == "__main__":
    run_uninstall()
