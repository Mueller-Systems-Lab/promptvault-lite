"""Diagnostics — Access PromptVault diagnostic status."""

from pathlib import Path
import json


def run_diagnostics() -> None:
    print("PromptVault Diagnostics")
    print("-" * 40)

    print("[INFO] Diagnostics for the native app are available via the Admin")
    print("       Observability panel in the PromptVault Lite app itself.")
    print()
    print("[INFO] In the app: Settings > Admin Observability > ON")
    print("       Then click the diagnostics button (magnifying glass)")
    print("       in the toolbar to view runtime traces.")

    # Check for any exported diagnostics files
    home = Path.home()
    patterns = [
        home / "Downloads" / "promptvault-diagnostics-*.json",
        home / "Documents" / "promptvault-diagnostics-*.json",
    ]
    found = False
    for pattern in patterns:
        for match in pattern.parent.glob(pattern.name):
            found = True
            try:
                with open(match) as f:
                    data = json.load(f)
                version = data.get("app_version", "unknown")
                generated = data.get("generated_at", "unknown")
                events = len(data.get("events", []))
                traces = len(data.get("traces", []))
                print(f"[INFO] Found diagnostics export: {match.name}")
                print(f"       App version: {version}")
                print(f"       Generated: {generated}")
                print(f"       Events: {events}")
                print(f"       Traces: {traces}")
            except Exception:
                print(f"[WARN] Could not read: {match}")

    if not found:
        print("[INFO] No exported diagnostics files found locally.")

    print()
    print("[INFO] Diagnostics and Admin Observability:")
    print("       - Memory-only, session-only by default")
    print("       - No secrets or full prompt content in diagnostic output")
    print("       - No network export, no cloud, no telemetry")
