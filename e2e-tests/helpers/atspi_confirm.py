#!/usr/bin/env python3
"""
atspi_confirm.py — semantic GTK dialog confirmation via AT-SPI.

Maps an X11-verified dialog window to its AT-SPI accessible, locates
the affirmative confirm button (by role, name, and state), and invokes
its accessibility action. All operations are fail-closed (Run Card §9/§10):

  - zero dialog candidates      → ATSPI_DIALOG_NOT_FOUND   (exit 12)
  - multiple dialog candidates  → ATSPI_DIALOG_AMBIGUOUS   (exit 13) — never first-wins
  - no confirm button           → ATSPI_CONFIRM_BUTTON_NOT_FOUND (exit 14)
  - multiple confirm buttons    → ATSPI_CONFIRM_BUTTON_AMBIGUOUS (exit 15)
  - button without action       → ATSPI_CONFIRM_ACTION_UNAVAILABLE (exit 16)
  - action failed               → ATSPI_CONFIRM_ACTION_FAILED (exit 17)
  - success                     → ATSPI_CONFIRM_ACTION_INVOKED (exit 0)

Selection rules are the pure functions in atspi_select.py (unit-tested
without a desktop session). GTK default-state buttons are preferred.

Requirements: python3-gi, gir1.2-atspi-2.0, at-spi2-core
"""

import argparse
import sys
import time

try:
    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
    ATSPI_AVAILABLE = True
except Exception as e:  # pragma: no cover - import guard
    ATSPI_AVAILABLE = False
    _ATSPI_ERROR = str(e)

# Pure selection logic (desktop-free, see test_atspi_select.py).
# Keep legacy underscore aliases so the existing 29 unit tests still pass.
from atspi_select import (
    normalize as _normalize,
    is_affirmative as _is_affirmative,
    is_cancel as _is_cancel,
    select_dialog_candidate,
    select_confirm_button_candidate,
)

# Exit codes (used by x11dialog.py subprocess integration)
EXIT_OK = 0
EXIT_ATSPI_UNAVAILABLE = 10
EXIT_SESSION_FAILED = 11
EXIT_DIALOG_NOT_FOUND = 12
EXIT_DIALOG_AMBIGUOUS = 13
EXIT_BUTTON_NOT_FOUND = 14
EXIT_BUTTON_AMBIGUOUS = 15
EXIT_ACTION_UNAVAILABLE = 16
EXIT_ACTION_FAILED = 17


# ── AT-SPI access helpers ────────────────────────────────────────────────

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


def _node_state(node, state_type):
    """Check whether an accessible has a given state (None-safe)."""
    if not ATSPI_AVAILABLE:
        return False
    try:
        return node.get_state_set().contains(state_type)
    except Exception:
        return False


def _node_actions(node):
    """Return the list of action names for an accessible (None-safe)."""
    actions = []
    try:
        na = node.get_n_actions()
        for ai in range(na):
            actions.append(node.get_action_name(ai))
    except Exception:
        pass
    return actions


def _has_real_action(node):
    """A real action must be one of click/press/activate (Run Card §10)."""
    for a in _node_actions(node):
        if a in ("click", "press", "activate"):
            return True
    return False


def _get_accelerator(node):
    """Read the GTK accelerator/mnemonic exposed via AT-SPI attributes.

    GTK buttons (e.g. '_Öffnen') expose an 'accelerator' attribute such as
    'Alt+o' or '<Alt>o'. Sending exactly that key combination activates the
    button through GTK's accelerator path — a locale-independent, semantic
    activation (Run Card §6 lists 'locale-independent accelerator' as a
    valid confirmation mechanism). Returns the raw attribute or None.
    """
    try:
        attrs = node.get_attributes()
        if not attrs:
            return None
        # get_attributes returns (keys, values) tuples or a dict-like map
        if isinstance(attrs, dict):
            return attrs.get("accelerator") or attrs.get("accel")
        if isinstance(attrs, (list, tuple)):
            for key, value in attrs:
                if key in ("accelerator", "accel"):
                    return value
    except Exception:
        pass
    return None


def _is_gtk_default(node):
    """GTK default-state marker (Run Card §10 prefers the default button)."""
    if not ATSPI_AVAILABLE:
        return False
    return _node_state(node, Atspi.StateType.IS_DEFAULT)


# ── Dialog mapping (Run Card §9) ─────────────────────────────────────────

def _collect_dialog_candidates(app, dialog_title, dialog_pid):
    """Collect ALL dialog-like candidates in an app as plain dicts."""
    try:
        app_pid = app.get_process_id()
    except Exception:
        app_pid = None
    try:
        app_name = app.get_name() or ""
    except Exception:
        app_name = ""

    pid_matches = (
        dialog_pid is None
        or app_pid is None
        or app_pid == dialog_pid
    )

    try:
        all_nodes = _collect_accessible(app, max_depth=6)
    except Exception:
        return []

    candidates = []
    for node in all_nodes:
        try:
            role = node.get_role_name()
        except Exception:
            continue
        if role not in ("dialog", "file chooser"):
            continue

        try:
            name = node.get_name() or ""
        except Exception:
            continue

        title_matches = bool(dialog_title and dialog_title in name)
        name_lower = name.lower()
        plausible = any(p in name_lower for p in (
            "ordner", "folder", "file chooser", "auswählen", "select",
            "öffnen", "open", "choose",
        ))

        candidates.append({
            "node": node,
            "name": name,
            "app_name": app_name,
            "app_pid": app_pid,
            "pid_matches": pid_matches,
            "title_matches": title_matches,
            "role": role,
            "visible": _node_state(node, Atspi.StateType.VISIBLE),
            "enabled": _node_state(node, Atspi.StateType.ENABLED),
            "plausible": plausible,
        })

    # Title match is the primary signal; keep plausible-name dialogs only
    # as fallback candidates (they still go through fail-closed selection).
    titled = [c for c in candidates if c["title_matches"]]
    if titled:
        return titled
    return [c for c in candidates if c["plausible"]]


def find_atspi_dialog(dialog_title="", dialog_pid=None):
    """Map the X11-verified dialog to its AT-SPI accessible.

    Returns (dialog_node, status_code) — fail-closed:
      (node, EXIT_OK)                    → ATSPI_DIALOG_MAPPED
      (None, EXIT_ATSPI_UNAVAILABLE)     → ATSPI_NOT_AVAILABLE
      (None, EXIT_SESSION_FAILED)        → ATSPI_SESSION_FAILED
      (None, EXIT_DIALOG_NOT_FOUND)      → ATSPI_DIALOG_NOT_FOUND
      (None, EXIT_DIALOG_AMBIGUOUS)      → ATSPI_DIALOG_AMBIGUOUS
    """
    if not ATSPI_AVAILABLE:
        sys.stderr.write(f"ATSPI_NOT_AVAILABLE: {_ATSPI_ERROR}\n")
        return None, EXIT_ATSPI_UNAVAILABLE

    try:
        Atspi.init()
        desktop = Atspi.get_desktop(0)
    except Exception as e:
        sys.stderr.write(f"ATSPI_SESSION_FAILED: {e}\n")
        return None, EXIT_SESSION_FAILED

    sys.stderr.write("ATSPI_SESSION_AVAILABLE\n")

    try:
        app_count = desktop.get_child_count()
    except Exception:
        app_count = 0

    all_candidates = []
    for i in range(app_count):
        try:
            app = desktop.get_child_at_index(i)
        except Exception:
            continue
        all_candidates.extend(
            _collect_dialog_candidates(app, dialog_title, dialog_pid)
        )

    if not all_candidates:
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
        return None, EXIT_DIALOG_NOT_FOUND

    selected = select_dialog_candidate(all_candidates)
    if selected is None:
        if len(all_candidates) > 1:
            details = [
                f"name={c['name'][:50]!r} app={c['app_name'][:30]!r} "
                f"pid={c['app_pid']} role={c['role']} title_match={c['title_matches']} "
                f"pid_match={c['pid_matches']} visible={c['visible']}"
                for c in all_candidates
            ]
            sys.stderr.write(
                f"ATSPI_DIALOG_AMBIGUOUS: {len(all_candidates)} candidates:\n"
            )
            for d in details:
                sys.stderr.write(f"  DIAG: {d}\n")
            return None, EXIT_DIALOG_AMBIGUOUS
        sys.stderr.write("ATSPI_DIALOG_NOT_FOUND: no valid candidate\n")
        return None, EXIT_DIALOG_NOT_FOUND

    node = selected["node"]
    name = selected["name"]
    sys.stderr.write(f"ATSPI_DIALOG_MAPPED: name={name[:80]}\n")
    return node, EXIT_OK


# ── Confirm button discovery (Run Card §10) ──────────────────────────────

def find_confirm_button(dialog, verify_only=False):
    """Find the affirmative confirm button within an AT-SPI dialog.

    verify_only: when True, the caller wants to verify button existence
    and semantics without invoking the action. Disabled buttons (like
    'Open' in an empty folder chooser) are then considered valid
    candidates — they become enabled after a valid path is entered.

    Returns (button_node, status_code) — fail-closed:
      (node, EXIT_OK)                 → ATSPI_CONFIRM_BUTTON_FOUND
      (None, EXIT_BUTTON_NOT_FOUND)   → ATSPI_CONFIRM_BUTTON_NOT_FOUND
      (None, EXIT_BUTTON_AMBIGUOUS)   → ATSPI_CONFIRM_BUTTON_AMBIGUOUS
    """
    if dialog is None:
        return None, EXIT_BUTTON_NOT_FOUND

    try:
        all_nodes = _collect_accessible(dialog, max_depth=6)
    except Exception:
        return None, EXIT_BUTTON_NOT_FOUND

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

        candidates.append({
            "node": node,
            "name": name,
            "enabled": _node_state(node, Atspi.StateType.ENABLED),
            "visible": _node_state(node, Atspi.StateType.VISIBLE),
            "is_default": _is_gtk_default(node),
            "has_action": _has_real_action(node),
        })

    if not candidates:
        sys.stderr.write("ATSPI_CONFIRM_BUTTON_NOT_FOUND: no buttons in dialog\n")
        return None, EXIT_BUTTON_NOT_FOUND

    selected = select_confirm_button_candidate(candidates, allow_disabled=verify_only)
    if selected is None:
        # Distinguish NOT_FOUND vs AMBIGUOUS for the diagnostic
        viable = [
            c for c in candidates
            if c["visible"] and (c["enabled"] or verify_only) and c["has_action"]
            and not _is_cancel(c["name"])
        ]
        # Diagnostic: dump all buttons in the dialog
        sys.stderr.write("DIAG: all buttons in dialog:\n")
        for c in candidates:
            sys.stderr.write(
                f"DIAG:   role=button name={c['name']!r} "
                f"enabled={c['enabled']} visible={c['visible']} "
                f"default={c['is_default']} has_action={c['has_action']}\n"
            )
        if len(viable) > 1:
            names = [c["name"] for c in viable]
            sys.stderr.write(
                f"ATSPI_CONFIRM_BUTTON_AMBIGUOUS: {len(viable)} viable candidates: {names}\n"
            )
            return None, EXIT_BUTTON_AMBIGUOUS
        sys.stderr.write(
            "ATSPI_CONFIRM_BUTTON_NOT_FOUND: no unique affirmative button\n"
        )
        return None, EXIT_BUTTON_NOT_FOUND

    button, name = selected["node"], selected["name"]
    actions = _node_actions(button)
    accel = _get_accelerator(button)
    accel_str = f" accelerator={accel!r}" if accel else ""
    sys.stderr.write(
        f"ATSPI_CONFIRM_BUTTON_FOUND: name={_normalize(name)!r} "
        f"enabled={selected['enabled']} visible={selected['visible']} "
        f"default={selected['is_default']} actions={actions}{accel_str}\n"
    )
    return button, EXIT_OK


# ── Action invocation (Run Card §10) ─────────────────────────────────────

def invoke_confirm_action(button, focus_first=False):
    """Invoke the confirm button's action via AT-SPI. Returns True on success.

    focus_first: default False. Calling Component.grab_focus() from a
    SEPARATE process has been observed to steal X input focus from the
    dialog to the root window (breaking subsequent XTEST input), so it is
    disabled by default. do_action alone is attempted; GTK may not route
    it to the real GtkButton clicked signal (documented platform limit),
    which is why x11dialog.py re-focuses the dialog and activates the
    verified default button via XTEST afterwards.
    """
    if button is None:
        return False

    if focus_first:
        try:
            comp = button.get_component_iface()
            if comp is not None:
                comp.grab_focus()
                time.sleep(0.15)
        except Exception:
            pass  # focus is best-effort; do_action still attempted

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
    action_index = None
    for ai in range(na):
        try:
            aname = button.get_action_name(ai)
        except Exception:
            continue
        if aname in ("click", "press", "activate"):
            action_index = ai
            break

    if action_index is None:
        # No recognized action name — still try index 0 (many GTK buttons
        # expose "click" only); fail-closed if that is not an action.
        action_index = 0

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


# ── Full pipeline + CLI (used by x11dialog.py as a subprocess) ───────────

def run_confirmation(dialog_title="", dialog_pid=None, post_action_delay_s=0.6,
                     verify_only=False, focus_button=False):
    """Full AT-SPI confirmation pipeline.

    verify_only: map the dialog + find the confirm button, but do NOT invoke
    the action. Used when the caller activates the verified GTK default
    button itself (documented workaround: AtkAction 'click' does not trigger
    the real GtkButton clicked signal, and Atspi.init()/do_action from a
    subprocess steals X input focus from the dialog).

    focus_button: additionally call Component.grab_focus() on the verified
    button, so the GTK-internal widget focus moves to the confirm button.
    The caller (x11dialog.py) then re-establishes the X input focus on the
    dialog window and sends one targeted XTEST Return, which activates the
    now-focused default button. This is the documented "semantic targeting
    with reliable input" combination: AT-SPI provides the semantic focus,
    XTEST provides the reliable activation.

    Returns (exit_code, button_action_name). Prints AT-SPI status lines
    to stderr; the final success line to stdout.
    """
    dialog, code = find_atspi_dialog(dialog_title=dialog_title, dialog_pid=dialog_pid)
    if dialog is None:
        return code, None

    button, code = find_confirm_button(dialog, verify_only=verify_only)
    if button is None:
        return code, None

    action_name = None
    try:
        na = button.get_n_actions()
        for ai in range(na):
            aname = button.get_action_name(ai)
            if aname in ("click", "press", "activate"):
                action_name = aname
                break
    except Exception:
        pass

    if focus_button:
        # Semantic focus: move the GTK-internal widget focus to the
        # verified confirm button (default-state preferred). This may
        # disturb the X input focus — the caller re-establishes it.
        try:
            comp = button.get_component_iface()
            if comp is not None:
                comp.grab_focus()
                time.sleep(0.2)
                sys.stderr.write("ATSPI_CONFIRM_BUTTON_FOCUSED\n")
        except Exception as e:
            sys.stderr.write(f"ATSPI_CONFIRM_BUTTON_FOCUS_FAILED: {e}\n")
            return EXIT_ACTION_UNAVAILABLE, action_name

    if verify_only:
        # Verification only: dialog mapped + affirmative default button found.
        # The caller (x11dialog.py) activates the verified button via XTEST
        # with re-established dialog focus.
        return EXIT_OK, action_name

    if not invoke_confirm_action(button):
        # Distinguish unavailable vs failed for the exit code
        return EXIT_ACTION_FAILED, action_name

    # Give GTK a moment to process the action before x11dialog re-checks
    if post_action_delay_s > 0:
        time.sleep(post_action_delay_s)
    return EXIT_OK, action_name


def main():
    parser = argparse.ArgumentParser(
        description="Confirm a GTK file dialog via AT-SPI (fail-closed)."
    )
    parser.add_argument("--title", default="",
                        help="Dialog title substring (from X11 verification)")
    parser.add_argument("--pid", type=int, default=None,
                        help="Dialog process ID (from X11 _NET_WM_PID, optional)")
    parser.add_argument("--post-action-delay-s", type=float, default=0.6,
                        help="Seconds to wait after invoking the action")
    parser.add_argument("--verify-only", action="store_true",
                        help="Map dialog + find button but do NOT invoke the action")
    parser.add_argument("--focus-button", action="store_true",
                        help="With --verify-only: grab GTK-internal focus on the "
                             "verified confirm button (caller activates via XTEST)")
    args = parser.parse_args()

    code, action_name = run_confirmation(
        dialog_title=args.title,
        dialog_pid=args.pid,
        post_action_delay_s=args.post_action_delay_s,
        verify_only=args.verify_only,
        focus_button=args.focus_button,
    )
    if code == EXIT_OK:
        mode = "VERIFIED" if args.verify_only else "CONFIRM"
        print(f"ATSPI_{mode}: action={action_name}")
    return code


if __name__ == "__main__":
    sys.exit(main())
