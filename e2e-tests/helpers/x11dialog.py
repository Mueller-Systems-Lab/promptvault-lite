#!/usr/bin/env python3
"""
x11dialog.py — type a path into a native file chooser dialog via X11 XTEST.

FAIL-CLOSED: Success is ONLY reported when a genuine dialog window has been
verified. Without that proof: DIALOG_WINDOW_NOT_FOUND (exit 2).

Pre-/post-click window snapshots are essential: the caller must capture all
visible window IDs BEFORE clicking the button and pass them via --pre-wids.
Only NEW windows (or windows with WM_TRANSIENT_FOR pointing to the app) are
considered as dialog candidates. Title matching alone is not sufficient.

Used by the E19 Native Tauri E2E Journey (Run Card §22).
Requirements: python3 + python-xlib (XTEST extension).

Usage:
    python3 x11dialog.py --path /tmp/pvl-archive-xyz --pre-wids 0x400001,0x400002
"""

import argparse
import re
import subprocess
import sys
import time

from Xlib import X, XK, display


# ── Window discovery ────────────────────────────────────────────────────

_WID_RE = re.compile(r"^\s*(0x[0-9a-fA-F]+)\s")


def _parse_xwininfo_tree():
    """Parse xwininfo -root -tree output into {wid: title_string} dict."""
    out = subprocess.run(
        ["xwininfo", "-root", "-tree"], capture_output=True, text=True
    ).stdout
    windows = {}
    for line in out.splitlines():
        m = _WID_RE.match(line)
        if not m:
            continue
        try:
            wid = int(m.group(1), 16)
        except ValueError:
            continue
        rest = line[m.end():].strip()
        windows[wid] = rest
    return windows


def _get_pid(d, wid):
    """Try _NET_WM_PID; returns None if unavailable (common under bare Xvfb)."""
    try:
        atom = d.intern_atom("_NET_WM_PID")
        prop = d.create_resource_object("window", wid).get_full_property(
            atom, X.AnyPropertyType
        )
        if prop:
            return int(prop.value.tolist()[0])
    except Exception:
        pass
    return None


def _get_wm_class(d, wid):
    """Try WM_CLASS; returns (instance, class) or (None, None)."""
    try:
        atom = d.intern_atom("WM_CLASS")
        prop = d.create_resource_object("window", wid).get_full_property(
            atom, X.AnyPropertyType
        )
        if prop:
            val = prop.value
            if hasattr(val, "split"):
                parts = val.split("\x00")
                return (parts[0] if len(parts) > 0 else None,
                        parts[1] if len(parts) > 1 else None)
    except Exception:
        pass
    return (None, None)


def _get_wm_transient_for(d, wid):
    """Try WM_TRANSIENT_FOR; returns parent wid or None."""
    try:
        atom = d.intern_atom("WM_TRANSIENT_FOR")
        prop = d.create_resource_object("window", wid).get_full_property(
            atom, X.AnyPropertyType
        )
        if prop:
            return int(prop.value.tolist()[0])
    except Exception:
        pass
    return None


def _get_input_focus(d):
    """Return the currently focused window ID, or None."""
    try:
        result = d.get_input_focus()
        if result.focus:
            return result.focus.id
    except Exception:
        pass
    return None


# ── Dialog detection ────────────────────────────────────────────────────

_DIALOG_TITLE_PATTERNS = [
    "ordner auswählen",
    "ordner öffnen",
    "open folder",
    "select folder",
    "choose a folder",
    "choose folder",
    "file chooser",
    "datei auswählen",
    "datei öffnen",
    "open file",
    "select file",
    "choose a file",
]


def _looks_like_dialog(title_lower):
    return any(p in title_lower for p in _DIALOG_TITLE_PATTERNS)


def find_dialog(d, app_title="promptvault", pre_wids=None):
    """Find a native file-dialog window distinct from the app window.

    Args:
        d: Xlib Display
        app_title: substring to identify the app window (case-insensitive)
        pre_wids: set of window IDs that existed BEFORE the button click.
                  Only windows NOT in this set (or with WM_TRANSIENT_FOR
                  pointing to an app WID) are considered dialog candidates.

    Returns (dialog_wid, info_dict) or (None, None).
    """
    windows = _parse_xwininfo_tree()
    app_wids = set()
    dialog_candidates = []

    for wid, title in windows.items():
        title_lower = title.lower()
        if app_title in title_lower:
            app_wids.add(wid)

    app_pids = set()
    for awid in app_wids:
        p = _get_pid(d, awid)
        if p is not None:
            app_pids.add(p)

    for wid, title in windows.items():
        title_lower = title.lower()
        if not _looks_like_dialog(title_lower):
            continue

        pid = _get_pid(d, wid)
        wm_class = _get_wm_class(d, wid)
        transient_for = _get_wm_transient_for(d, wid)

        # A dialog candidate must be either:
        #  (a) a NEW window that wasn't present before the click, OR
        #  (b) a window whose WM_TRANSIENT_FOR points to an app window
        is_new = pre_wids is not None and wid not in pre_wids
        is_transient_for_app = transient_for is not None and transient_for in app_wids

        if not is_new and not is_transient_for_app:
            continue

        info = {
            "title": title,
            "pid": pid,
            "wm_class": wm_class,
            "transient_for": transient_for,
            "is_new": is_new,
            "is_transient_for_app": is_transient_for_app,
        }
        dialog_candidates.append((wid, info))

    if not dialog_candidates:
        return None, None

    # Score candidates. Primary signal: WM_TRANSIENT_FOR pointing to app.
    # Secondary: genuinely new window. PID/WM_CLASS are weak supplements.
    best = None
    for wid, info in dialog_candidates:
        score = 0
        if info["is_transient_for_app"]:
            score += 70  # strongest: modal relationship to app
        if info["is_new"]:
            score += 40  # strong: genuinely new window after click
        if info["pid"] is not None and info["pid"] not in app_pids:
            score += 10  # weak: different PID
        if wid not in app_wids:
            score += 5   # weak: different WID
        if info["wm_class"][0] and "promptvault" not in (info["wm_class"][0] or "").lower():
            score += 3   # very weak: different WM_CLASS
        if best is None or score > best[0]:
            best = (score, wid, info)

    if best is None:
        return None, None
    return best[1], best[2]


# ── Window focus ────────────────────────────────────────────────────────

def focus_and_verify(d, wid):
    """Set input focus and verify it landed. Returns True iff verified."""
    window = d.create_resource_object("window", wid)
    d.set_input_focus(window, X.RevertToParent, X.CurrentTime)
    d.sync()
    time.sleep(0.15)

    focused = _get_input_focus(d)
    if focused is None:
        return False
    # The focused window must be the dialog or a child of the dialog.
    # We check if the focused WID equals the dialog WID; full tree
    # ancestry check is expensive on bare Xvfb — rely on direct match.
    return focused == wid


# ── Keyboard input via XTEST ────────────────────────────────────────────

def keysym_for_char(ch):
    """Return the keysym for a single character, or None if unmappable."""
    PUNCT_MAP = {
        "/": "slash",    "-": "minus",     "_": "underscore",
        ".": "period",   " ": "space",     ":": "colon",
        "~": "asciitilde","(": "parenleft", ")": "parenright",
        "+": "plus",     "=": "equal",     ",": "comma",
        "@": "at",
    }
    if ch in PUNCT_MAP:
        return XK.string_to_keysym(PUNCT_MAP[ch])
    try:
        ks = XK.string_to_keysym(ch)
        if ks == 0:
            return None
        return ks
    except Exception:
        return None


SHIFT_CHARS = set('~!@#$%^&*()_+{}|:"<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ')


def type_text(d, text, delay_ms):
    """Type text via XTEST. Returns list of unmappable characters (empty = all OK)."""
    unmappable = []
    for ch in text:
        keysym = keysym_for_char(ch)
        if keysym is None or keysym == 0:
            unmappable.append(ch)
            continue
        keycode = d.keysym_to_keycode(keysym)
        if not keycode:
            unmappable.append(ch)
            continue

        if ch in SHIFT_CHARS:
            shift_code = d.keysym_to_keycode(XK.string_to_keysym("Shift_L"))
            d.xtest_fake_input(X.KeyPress, shift_code)
            d.xtest_fake_input(X.KeyPress, keycode)
            d.xtest_fake_input(X.KeyRelease, keycode)
            d.xtest_fake_input(X.KeyRelease, shift_code)
        else:
            d.xtest_fake_input(X.KeyPress, keycode)
            d.xtest_fake_input(X.KeyRelease, keycode)
        d.sync()
        if delay_ms:
            time.sleep(delay_ms / 1000.0)
    return unmappable


def press_combo(d, keysyms):
    """Press a key combination, then release in reverse order."""
    codes = [d.keysym_to_keycode(ks) for ks in keysyms]
    for c in codes:
        if c:
            d.xtest_fake_input(X.KeyPress, c)
    d.sync()
    time.sleep(0.05)
    for c in reversed(codes):
        if c:
            d.xtest_fake_input(X.KeyRelease, c)
    d.sync()


# ── Diagnostic helper ───────────────────────────────────────────────────

def _dump_all_windows(d):
    """Print all windows to stderr for debugging."""
    windows = _parse_xwininfo_tree()
    sys.stderr.write("DIAG: all windows in tree:\n")
    for wid, title in sorted(windows.items()):
        pid = _get_pid(d, wid)
        wm_class = _get_wm_class(d, wid)
        tf = _get_wm_transient_for(d, wid)
        sys.stderr.write(
            f"DIAG:   0x{wid:x} pid={pid} wm_class={wm_class} "
            f"transient_for=0x{tf:x}" if tf else f"transient_for=None"
            + f" title={title[:100]!r}\n"
        )


# ── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Type a path into a native file dialog via X11 XTEST (fail-closed)."
    )
    parser.add_argument("--path", required=True, help="Path to type into the dialog")
    parser.add_argument("--ctrl-l", action="store_true", default=True,
                        help="Send Ctrl+L to open the location entry")
    parser.add_argument("--delay-ms", type=int, default=15,
                        help="Delay between keystrokes in ms")
    parser.add_argument("--pre-delay-s", type=float, default=1.0,
                        help="Initial delay before searching for the dialog")
    parser.add_argument("--timeout-s", type=float, default=20.0,
                        help="Maximum time to wait for the dialog to appear")
    parser.add_argument("--app-title", default="promptvault",
                        help="Substring to identify the app window (case-insensitive)")
    parser.add_argument("--pre-wids", default="",
                        help="Comma-separated hex WIDs present BEFORE the button click")
    args = parser.parse_args()

    # Parse pre-click window IDs
    pre_wids = set()
    if args.pre_wids:
        for token in args.pre_wids.split(","):
            token = token.strip()
            if not token:
                continue
            try:
                pre_wids.add(int(token, 16))
            except ValueError:
                sys.stderr.write(f"WARN: invalid pre-wid token: {token!r}\n")

    d = display.Display()
    time.sleep(args.pre_delay_s)

    # ── Step 1: Wait for a dialog window to appear ────────────────────
    deadline = time.time() + args.timeout_s
    dialog_wid = None
    dialog_info = None

    while time.time() < deadline:
        dialog_wid, dialog_info = find_dialog(d, app_title=args.app_title,
                                               pre_wids=pre_wids if pre_wids else None)
        if dialog_wid is not None:
            break
        time.sleep(0.5)

    # ── Step 2: Fail if no dialog found ───────────────────────────────
    if dialog_wid is None or dialog_info is None:
        sys.stderr.write(
            "DIALOG_WINDOW_NOT_FOUND: no verified file-dialog window detected "
            f"within {args.timeout_s:.0f}s\n"
        )
        sys.stderr.write(f"DIAG: pre_wids={sorted(pre_wids)!r}\n")
        _dump_all_windows(d)
        return 2

    # ── Step 3: Verify and document the dialog ────────────────────────
    pid_str = f"pid={dialog_info['pid']}" if dialog_info["pid"] is not None else "pid=unknown"
    tf = dialog_info.get("transient_for")
    tf_str = f"transient_for=0x{tf:x}" if tf is not None else "transient_for=None"
    wm_class = dialog_info["wm_class"]
    wm_str = f"wm_class={wm_class}" if wm_class and wm_class[0] else "wm_class=unknown"
    new_str = "new_window" if dialog_info.get("is_new") else "not_new"
    sys.stderr.write(
        f"DIALOG_FOUND: wid=0x{dialog_wid:x} "
        f"title={dialog_info['title'][:80]!r} {pid_str} {wm_str} {tf_str} {new_str}\n"
    )

    # ── Step 4: Focus the dialog and verify ───────────────────────────
    if not focus_and_verify(d, dialog_wid):
        focused_now = _get_input_focus(d)
        sys.stderr.write(
            f"DIALOG_FOCUS_VERIFICATION_FAILED: "
            f"target=0x{dialog_wid:x} actual_focus=0x{focused_now:x}" if focused_now
            else "target=0x{dialog_wid:x} actual_focus=None" + "\n"
        )
        return 3

    time.sleep(0.2)

    # ── Step 5: Type the path (fail on unmappable characters) ─────────
    if args.ctrl_l:
        press_combo(d, [XK.string_to_keysym("Control_L"), XK.string_to_keysym("l")])
        time.sleep(0.3)

    unmappable = type_text(d, args.path, args.delay_ms)
    if unmappable:
        sys.stderr.write(
            f"UNMAPPABLE_CHARACTERS_IN_PATH: cannot type {unmappable!r} "
            f"— path would be incomplete\n"
        )
        return 6

    time.sleep(0.2)

    # Press Return twice:
    #  - first Enter navigates into the folder (location entry)
    #  - second Enter activates the "Öffnen"/"Open" button
    ret = d.keysym_to_keycode(XK.string_to_keysym("Return"))
    d.xtest_fake_input(X.KeyPress, ret)
    d.xtest_fake_input(X.KeyRelease, ret)
    d.sync()
    time.sleep(0.6)
    d.xtest_fake_input(X.KeyPress, ret)
    d.xtest_fake_input(X.KeyRelease, ret)
    d.sync()

    # ── Step 6: Report input sent to verified dialog ──────────────────
    # The caller (E19 journey spec) must independently verify that the
    # dialog closed and the archive was loaded.
    print(f"INPUT_SENT_TO_VERIFIED_DIALOG: wid=0x{dialog_wid:x} "
          f"chars={len(args.path)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
