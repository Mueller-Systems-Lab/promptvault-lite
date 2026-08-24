#!/usr/bin/env python3
"""R2.1 cleanroom — contamination scan self-test.

Runs `contamination_scan` over the repository and asserts exit 0 after the
decontamination. If the scan reports remaining hits, they are printed so they
can be fixed. Plain Python asserts + exit codes (repo convention; no pytest
dependency).

Usage:
    python3 scripts/__tests__/r21_contamination_scan.py
"""
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_scanner():
    scan_path = os.path.join(ROOT, "scripts", "contamination_scan.py")
    spec = importlib.util.spec_from_file_location("contamination_scan", scan_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    mod = load_scanner()
    by_file, corpus_count = mod.scan_all()
    if by_file:
        for rel in sorted(by_file):
            for lineno, kind, detail in sorted(by_file[rel]):
                print(f"{rel}:{lineno}: [{kind}] {detail}")
        raise AssertionError(
            f"contamination_scan found {sum(len(v) for v in by_file.values())} "
            f"hit(s) across {len(by_file)} file(s) — decontamination incomplete"
        )
    assert corpus_count > 0, "no corpus strings loaded — corpus missing?"
    print(f"R21_CONTAMINATION_SCAN: PASS (0 matches, {corpus_count} corpus strings)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as e:
        print(f"R21_CONTAMINATION_SCAN: FAIL — {e}")
        sys.exit(1)
