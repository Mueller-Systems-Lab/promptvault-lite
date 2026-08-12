"""Platform detection utilities."""

import sys
import platform


def os_name() -> str:
    system = platform.system()
    if system == "Windows":
        return "windows"
    elif system == "Linux":
        return "linux"
    elif system == "Darwin":
        return "macos"
    return system.lower()


def arch() -> str:
    machine = platform.machine().lower()
    if machine in ("amd64", "x86_64", "x64"):
        return "x86_64"
    if machine in ("arm64", "aarch64"):
        return "aarch64"
    return machine


def platform_tag() -> str:
    return f"{os_name()}-{arch()}"
