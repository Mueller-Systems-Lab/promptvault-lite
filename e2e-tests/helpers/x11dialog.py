#!/usr/bin/env python3
"""
x11dialog.py — type a path into a native GTK file chooser via X11 XTEST.

Used by the E19 native Tauri E2E journey: the app opens the REAL GTK folder
dialog (rfd/gtk3); this helper sends REAL X11 keyboard events to it, so no
Tauri IPC is mocked or replaced.

Requirements: python3 + python-xlib (XTEST extension).
Usage:
    python3 x11dialog.py --path /tmp/pvl-archive-xyz [--ctrl-l] [--delay-ms 15]

The helper types Ctrl+L (opens the GTK location entry), types the path
character by character, then presses Return.
"""

import argparse
import subprocess
import sys
import time

from Xlib import X, XK, display


def focus_window_by_title(d, title):
    """Find a window by title (via xwininfo -root -tree) and set X input focus.

    Required under bare Xvfb: ohne Window-Manager bekommt der GTK-Dialog
    keinen automatischen Input-Focus — XTEST-Tastendrücke gingen ins Leere.
    """
    out = subprocess.run(
        ["xwininfo", "-root", "-tree"], capture_output=True, text=True
    ).stdout
    for line in out.splitlines():
        if title in line:
            parts = line.strip().split()
            if not parts:
                continue
            try:
                wid = int(parts[0], 16)
            except ValueError:
                continue
            window = d.create_resource_object("window", wid)
            d.set_input_focus(window, X.RevertToParent, X.CurrentTime)
            d.sync()
            return True
    return False


def keysym_for_char(ch):
    """Return the keysym for a single character (explicit map for punctuation)."""
    # XK.string_to_keysym handles letters/digits but returns 0 for many
    # punctuation chars — provide an explicit map for path-critical symbols.
    PUNCT_MAP = {
        "/": "slash",
        "-": "minus",
        "_": "underscore",
        ".": "period",
        " ": "space",
        ":": "colon",
        "~": "asciitilde",
        "(": "parenleft",
        ")": "parenright",
        "+": "plus",
        "=": "equal",
        ",": "comma",
        "@": "at",
    }
    if ch in PUNCT_MAP:
        return XK.string_to_keysym(PUNCT_MAP[ch])
    try:
        return XK.string_to_keysym(ch)
    except Exception:
        return None


# Characters that require the Shift modifier on a US-style layout.
SHIFT_CHARS = set('~!@#$%^&*()_+{}|:"<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ')


def type_text(d, text, delay_ms):
    for ch in text:
        keysym = keysym_for_char(ch)
        if keysym is None or keysym == 0:
            # Fallback: skip characters we cannot map (keeps paths ASCII-safe)
            sys.stderr.write(f"WARN: cannot map char {ch!r}\n")
            continue
        keycode = d.keysym_to_keycode(keysym)
        if not keycode:
            sys.stderr.write(f"WARN: no keycode for {ch!r}\n")
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


def press_combo(d, keysyms):
    """Press a key combination (list of keysyms) in order, then release reversed."""
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True)
    parser.add_argument("--ctrl-l", action="store_true", default=True)
    parser.add_argument("--delay-ms", type=int, default=15)
    parser.add_argument("--pre-delay-s", type=float, default=1.0)
    parser.add_argument("--window-title", default="Prompt-Ordner auswählen")
    args = parser.parse_args()

    d = display.Display()
    time.sleep(args.pre_delay_s)

    # Input-Fokus explizit auf das Dialog-Fenster setzen (WM-freies Xvfb)
    if args.window_title:
        if not focus_window_by_title(d, args.window_title):
            sys.stderr.write(f"WARN: Dialog-Fenster '{args.window_title}' nicht gefunden\n")
        else:
            time.sleep(0.3)

    if args.ctrl_l:
        press_combo(d, [XK.string_to_keysym("Control_L"), XK.string_to_keysym("l")])
        time.sleep(0.3)

    type_text(d, args.path, args.delay_ms)
    time.sleep(0.2)

    ret = d.keysym_to_keycode(XK.string_to_keysym("Return"))
    # GTK FileChooser: erstes Enter navigiert in den Ordner (Location-Entry),
    # zweites Enter aktiviert den "Öffnen"-Button.
    d.xtest_fake_input(X.KeyPress, ret)
    d.xtest_fake_input(X.KeyRelease, ret)
    d.sync()
    time.sleep(0.6)
    d.xtest_fake_input(X.KeyPress, ret)
    d.xtest_fake_input(X.KeyRelease, ret)
    d.sync()

    print(f"OK: typed {len(args.path)} chars into dialog (2x Return)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
