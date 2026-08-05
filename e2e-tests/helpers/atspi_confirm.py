#!/usr/bin/env python3
"""
atspi_confirm.py — semantic GTK dialog confirmation via AT-SPI.

Maps an X11-verified dialog window to its AT-SPI accessible, locates
the affirmative confirm button (by role, name, and state), and invokes
its accessibility action. All operations are fail-closed.

Requirements: python3-gi, gir1.2-atspi-2.0, at-spi2-core
"""

import sys
import time

try:
    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
    ATSPI_AVAILABLE = True
except Exception as e:
    ATSPI_AVAILABLE = False
    _ATSPI_ERROR = str(e)


# ── Button name normalization ──────────────────────────────────────────

_AFFIRMATIVE_NAMES = {
    "auswählen", "auswahlen", "öffnen", "offnen", "open",
    "select", "choose", "ok",
}

_CANCEL_NAMES = {
    "abbrechen", "cancel", "schließen", "schliessen", "close",
    "nein", "no",
}


def _normalize(name):
    """Normalize a button name: lowercase, strip mnemonics and ellipsis."""
    if not name:
        return ""
    n = name.casefold().strip()
    # Remove GTK mnemonics (underscore prefix)
    while n.startswith("_"):
        n = n[1:]
    # Remove trailing ellipsis
    if n.endswith("..."):
        n = n[:-3].strip()
    if n.endswith(".."):
        n = n[:-2].strip()
    return n


def _is_affirmative(name):
    """Check if normalized name matches known confirm-button names."""
    n = _normalize(name)
    return n in _AFFIRMATIVE_NAMES


def _is_cancel(name):
    """Check if normalized name matches known cancel-button names."""
    n = _normalize(name)
    return n in _CANCEL_NAMES


# ── AT-SPI dialog mapping ──────────────────────────────────────────────

def _collect_accessible(obj, depth=0, max_depth=8):
    """Recursively collect all accessible objects in the subtree."""
    results = [obj]
    if depth >= max_depth:
        return results
    try:
        count = obj.get_child_count()
    except Exception:
        count = 0
    for i in range(count):
        try:
            child = obj.get_child_at_index(i)
        except Exception:
            continue
        results.extend(_collect_accessible(child, depth + 1, max_depth))
    return results


def _find_dialog_in_app(app, dialog_title, dialog_pid):
    """Search an AT-SPI application for a dialog matching title and PID."""
    # Check the app's process ID first (fast filter)
    try:
        app_pid = app.get_process_id()
    except Exception:
        app_pid = None

    if dialog_pid is not None and app_pid is not None and app_pid != dialog_pid:
        return None

    # Search the app's subtree for a dialog/frame matching the title
    try:
        all_nodes = _collect_accessible(app, max_depth=6)
    except Exception:
        return None

    best = None
    for node in all_nodes:
        try:
            role = node.get_role_name()
        except Exception:
            continue

        if role not in ("dialog", "frame", "window", "file chooser"):
            continue

        try:
            name = node.get_name() or ""
        except Exception:
            continue

        # Title match: the AT-SPI name should contain the dialog title substring
        if dialog_title and dialog_title in name:
            return node

        # Fallback: any dialog/frame with a plausible file-chooser name
        name_lower = name.lower()
        if any(p in name_lower for p in (
            "ordner", "folder", "file chooser", "auswählen", "select",
            "öffnen", "open", "choose"
        )):
            if best is None:
                best = node

    return best


def find_atspi_dialog(dialog_title="", dialog_pid=None):
    """Map the X11-verified dialog to its AT-SPI accessible.

    Returns the accessible dialog object, or None if not found.
    Side-effect: prints ATSPI_DIALOG_MAPPED to stderr on success,
    ATSPI_DIALOG_NOT_FOUND or ATSPI_DIALOG_AMBIGUOUS on failure.
    """
    if not ATSPI_AVAILABLE:
        sys.stderr.write(f"ATSPI_NOT_AVAILABLE: {_ATSPI_ERROR}\n")
        return None

    try:
        Atspi.init()
        desktop = Atspi.get_desktop(0)
    except Exception as e:
        sys.stderr.write(f"ATSPI_SESSION_FAILED: {e}\n")
        return None

    sys.stderr.write("ATSPI_SESSION_AVAILABLE\n")

    candidates = []
    try:
        app_count = desktop.get_child_count()
    except Exception:
        app_count = 0

    for i in range(app_count):
        try:
            app = desktop.get_child_at_index(i)
        except Exception:
            continue

        dialog = _find_dialog_in_app(app, dialog_title, dialog_pid)
        if dialog is not None:
            candidates.append(dialog)

    if len(candidates) == 0:
        # Diagnostic: show all top-level app names and PIDs
        sys.stderr.write("ATSPI_DIALOG_NOT_FOUND\n")
        sys.stderr.write("DIAG: AT-SPI applications:\n")
        for i in range(app_count):
            try:
                app = desktop.get_child_at_index(i)
                name = app.get_name() or "(unnamed)"
                pid = app.get_process_id()
                sys.stderr.write(f"DIAG:   [{i}] name={name[:60]} pid={pid}\n")
            except Exception:
                pass
        return None

    if len(candidates) > 1:
        names = []
        for c in candidates:
            try:
                names.append(c.get_name() or "(unnamed)")
            except Exception:
                names.append("(error)")
        sys.stderr.write(f"ATSPI_DIALOG_AMBIGUOUS: {len(candidates)} candidates: {names}\n")
        # Return the first candidate anyway, but log the ambiguity
        return candidates[0]

    dialog = candidates[0]
    try:
        name = dialog.get_name() or "(unnamed)"
    except Exception:
        name = "(unknown)"
    sys.stderr.write(f"ATSPI_DIALOG_MAPPED: name={name[:80]}\n")
    return dialog


# ── Confirm button discovery ───────────────────────────────────────────

def find_confirm_button(dialog):
    """Find the affirmative confirm button within an AT-SPI dialog.

    Returns the accessible button object, or None.
    """
    if dialog is None:
        return None

    try:
        all_nodes = _collect_accessible(dialog, max_depth=6)
    except Exception:
        return None

    candidates = []
    for node in all_nodes:
        try:
            role = node.get_role_name()
        except Exception:
            continue

        if role not in ("push button", "button", "toggle button"):
            continue

        try:
            name = node.get_name() or ""
        except Exception:
            continue

        if _is_affirmative(name):
            candidates.append((node, name))
            continue

        # Also check if the node name is a close match
        nl = _normalize(name)
        if any(aff in nl for aff in ("auswähl", "öffn", "open", "select", "choos", "ok")):
            if not _is_cancel(name):
                candidates.append((node, name))

    if not candidates:
        sys.stderr.write("ATSPI_CONFIRM_BUTTON_NOT_FOUND\n")
        # Diagnostic: dump all buttons in the dialog
        sys.stderr.write("DIAG: all buttons in dialog:\n")
        for node in all_nodes:
            try:
                role = node.get_role_name()
            except Exception:
                continue
            if "button" in role.lower():
                try:
                    n = node.get_name() or "(unnamed)"
                    enabled = node.get_state_set().contains(Atspi.StateType.ENABLED)
                    visible = node.get_state_set().contains(Atspi.StateType.VISIBLE)
                    actions = []
                    try:
                        na = node.get_n_actions()
                        for ai in range(na):
                            actions.append(node.get_action_name(ai))
                    except Exception:
                        pass
                    sys.stderr.write(
                        f"DIAG:   role={role} name={n!r} enabled={enabled} "
                        f"visible={visible} actions={actions}\n"
                    )
                except Exception:
                    pass
        return None

    if len(candidates) > 1:
        names = [n for _, n in candidates]
        # Prefer exact affirmative match
        exact = [(node, n) for node, n in candidates if _is_affirmative(n)]
        if len(exact) == 1:
            candidates = exact
        else:
            sys.stderr.write(
                f"ATSPI_CONFIRM_BUTTON_AMBIGUOUS: {len(candidates)} candidates: {names}\n"
            )
            # Use first candidate; caller sees the ambiguity warning

    button, name = candidates[0]
    try:
        normalized = _normalize(name)
        actions = []
        try:
            na = button.get_n_actions()
            for ai in range(na):
                actions.append(button.get_action_name(ai))
        except Exception:
            pass

        enabled = button.get_state_set().contains(Atspi.StateType.ENABLED)
        visible = button.get_state_set().contains(Atspi.StateType.VISIBLE)

        sys.stderr.write(
            f"ATSPI_CONFIRM_BUTTON_FOUND: name={normalized!r} "
            f"enabled={enabled} visible={visible} actions={actions}\n"
        )

        if not enabled:
            sys.stderr.write("ATSPI_CONFIRM_BUTTON_DISABLED\n")
            return None
        if not visible:
            sys.stderr.write("ATSPI_CONFIRM_BUTTON_HIDDEN\n")
            return None

    except Exception as e:
        sys.stderr.write(f"ATSPI_CONFIRM_BUTTON_STATE_ERROR: {e}\n")
        return None

    return button


# ── Action invocation ──────────────────────────────────────────────────

def invoke_confirm_action(button):
    """Invoke the confirm button's action via AT-SPI. Returns True on success."""
    if button is None:
        return False

    # Find the first available action: click, press, activate
    try:
        na = button.get_n_actions()
    except Exception:
        sys.stderr.write("ATSPI_CONFIRM_ACTION_UNAVAILABLE: cannot get actions\n")
        return False

    if na == 0:
        sys.stderr.write("ATSPI_CONFIRM_ACTION_UNAVAILABLE: button has no actions\n")
        return False

    # Prefer named actions; fall back to action index 0
    action_index = 0
    for ai in range(na):
        try:
            aname = button.get_action_name(ai)
        except Exception:
            continue
        if aname in ("click", "press", "activate"):
            action_index = ai
            break

    try:
        action_name = button.get_action_name(action_index)
    except Exception:
        action_name = f"index_{action_index}"

    sys.stderr.write(f"ATSPI_CONFIRM_ACTION_INVOKED: action={action_name}\n")

    try:
        result = button.do_action(action_index)
        if result is False:
            sys.stderr.write("ATSPI_CONFIRM_ACTION_FAILED: do_action returned False\n")
            return False
        return True
    except Exception as e:
        sys.stderr.write(f"ATSPI_CONFIRM_ACTION_FAILED: {e}\n")
        return False
