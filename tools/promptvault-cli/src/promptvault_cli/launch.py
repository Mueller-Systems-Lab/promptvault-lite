"""Launch — Start the installed PromptVault app."""

import sys
import subprocess
import time
from pathlib import Path

from promptvault_cli.doctor import find_install_path, find_executable


def run_launch() -> None:
    print("PromptVault Launcher")
    print("-" * 40)

    install_path = find_install_path()
    if not install_path:
        print("[FAIL] PromptVault is not installed.")
        print("       Run 'promptvault install' first.")
        sys.exit(1)

    exe = find_executable(install_path)
    if not exe:
        print("[FAIL] No PromptVault executable found.")
        print(f"       Searched: {install_path}")
        sys.exit(1)

    print(f"[INFO] Launching: {exe}")
    try:
        proc = subprocess.Popen(
            [str(exe)],
            cwd=str(exe.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        print(f"[FAIL] Could not launch: {e}")
        sys.exit(1)

    # Give the process a moment to start; detect early crash.
    time.sleep(1.5)
    if proc.poll() is not None:
        print(f"[FAIL] Process exited immediately with code {proc.returncode}")
        sys.exit(1)

    print(f"[OK] PromptVault Lite launched (PID {proc.pid}).")


if __name__ == "__main__":
    run_launch()
