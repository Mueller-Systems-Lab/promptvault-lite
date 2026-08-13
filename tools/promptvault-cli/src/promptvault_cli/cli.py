"""PromptVault CLI — Main entry point."""

import sys
import argparse

from promptvault_cli import __version__ as APP_VERSION
from promptvault_cli.doctor import run_doctor
from promptvault_cli.install_cmd import run_install
from promptvault_cli.launch import run_launch
from promptvault_cli.update_cmd import run_update
from promptvault_cli.uninstall_cmd import run_uninstall
from promptvault_cli.diagnostics import run_diagnostics


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="promptvault",
        description="PromptVault Lite — Local Prompt Management CLI",
    )
    parser.add_argument(
        "--version", action="store_true", help="Show CLI version and exit"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    subparsers.add_parser("doctor", help="Check system and installation status")
    subparsers.add_parser("install", help="Install the native PromptVault app")
    subparsers.add_parser("launch", help="Start the installed PromptVault app")
    subparsers.add_parser("update", help="Check for and install app updates")
    subparsers.add_parser("uninstall", help="Remove the native app (keeps vault data)")
    subparsers.add_parser("diagnostics", help="Show diagnostic status")

    args = parser.parse_args()

    if args.version:
        print(f"promptvault {APP_VERSION}")
        print(f"Python {sys.version}")
        return

    if args.command == "doctor":
        run_doctor()
    elif args.command == "install":
        run_install()
    elif args.command == "launch":
        run_launch()
    elif args.command == "update":
        run_update()
    elif args.command == "uninstall":
        run_uninstall()
    elif args.command == "diagnostics":
        run_diagnostics()
    else:
        if not args.command:
            parser.print_help()
            print()
            print("Run 'promptvault doctor' to check your setup.")


if __name__ == "__main__":
    main()
