#!/usr/bin/env python3
"""PromptVault R2.1 cleanroom — contamination scan.

Scans the production source tree for benchmark contamination:
  1. Case-ID patterns (v1/v2/v3 corpus IDs).
  2. Gold-anchor / calibration-provenance tokens.
  3. Verbatim corpus prompt overlap (normalized full-string equality against
     the four benchmark corpus files).

Exit code 0 only when zero matches. Every match is printed with file:line.

Usage:
    python3 scripts/contamination_scan.py            # scan and exit non-zero on hits
    python3 -c "import sys; sys.path.insert(0,'scripts'); import contamination_scan; contamination_scan.scan_and_report()"

Scanned roots: src-tauri/src/**/*.rs, src/**/*.{ts,tsx}, scripts/**/*.py
Excluded: benchmark corpora/results directories and this scanner's own
fixtures (the self-test module under scripts/__tests__/).
"""
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CASE_ID_PATTERNS = [
    r"sem-t-", r"sem-g-", r"sem-r-",
    r"s2-", r"s2-h-", r"v3-h-",
    r"fmis-", r"famb-", r"fguid-", r"rtpl-",
    r"pcon-", r"pguid-", r"pred-", r"pkey-", r"pver-",
    r"fsafe-", r"fph-", r"bhns-", r"bfak-", r"bfill-", r"bguid-",
    r"dev-tpl-", r"dev-rep-",
]
GOLD_ANCHOR_TOKENS = [
    "gold 9", "gold 90", "gold 6", "gold 64", "gold 54",
    "calibration v2", "error class", "reg3", "debug_dump_dims",
]

CORPUS_FILES = [
    "benchmarks/semantic-quality/cases/calibration.json",
    "benchmarks/semantic-quality/holdout/cases.json",
    "benchmarks/semantic-quality-v2/cases/development.json",
    "benchmarks/semantic-quality-v2/cases/holdout.json",
]

# Roots to scan (relative to repo root).
SCAN_ROOTS = [
    ("src-tauri/src", "*.rs"),
    ("src", "*.ts"),
    ("src", "*.tsx"),
    ("scripts", "*.py"),
]

# Paths excluded from the scan: benchmark corpora/results live under
# benchmarks/ which is never in SCAN_ROOTS; the scanner's own self-test
# fixtures are excluded so the scanner can assert itself clean. The scanner
# file itself is excluded too — its pattern tables are the tool, not
# contamination.
EXCLUDE_SUBDIRS = ("__tests__",)
EXCLUDE_PREFIXES = ()
EXCLUDE_FILES = ("scripts/contamination_scan.py",)


def normalize_prompt(s: str) -> str:
    """Normalized form used for verbatim corpus overlap comparison."""
    return re.sub(r"\s+", " ", s.strip())


def load_corpus_strings():
    """All corpus prompt strings (normalized) from the four corpus files."""
    out = set()
    for rel in CORPUS_FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        import json
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for case in data:
            prompt = case.get("prompt")
            if isinstance(prompt, str) and prompt.strip():
                out.add(normalize_prompt(prompt))
    return out


def iter_scanned_files():
    """Yield (absolute_path, relative_path) for every scanned source file."""
    for sub, pattern in SCAN_ROOTS:
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        for path in glob.glob(os.path.join(base, "**", pattern), recursive=True):
            rel = os.path.relpath(path, ROOT)
            parts = rel.split(os.sep)
            if any(seg in EXCLUDE_SUBDIRS for seg in parts):
                continue
            if any(rel.startswith(pfx) for pfx in EXCLUDE_PREFIXES):
                continue
            if rel in EXCLUDE_FILES:
                continue
            yield path, rel


def string_literals(text):
    """Extract double-quoted Rust/Python string literals (escape-aware).

    Returns a list of (start_offset, literal_text) pairs. Multi-line Rust
    strings use `\\n` escapes inside a single literal; Python `r"..."` and
    triple-quoted strings are not extracted (they cannot hold a corpus prompt
    as a single normalized line in this codebase).
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == '"':
            j = i + 1
            buf = []
            while j < n:
                ch = text[j]
                if ch == "\\" and j + 1 < n:
                    nxt = text[j + 1]
                    buf.append({"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\"}.get(nxt, nxt))
                    j += 2
                    continue
                if ch == '"':
                    break
                buf.append(ch)
                j += 1
            out.append((i, "".join(buf)))
            i = j + 1
        else:
            i += 1
    return out


def scan_file(path, rel, corpus_strings):
    """Return a list of (line_no, kind, detail) contamination hits."""
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    hits = []

    lines = text.splitlines()
    for lineno, line in enumerate(lines, 1):
        low = line.lower()
        for pat in CASE_ID_PATTERNS:
            if re.search(re.escape(pat.lower()), low):
                hits.append((lineno, "case-id", pat))
                break
        else:
            for tok in GOLD_ANCHOR_TOKENS:
                if tok.lower() in low:
                    hits.append((lineno, "gold-anchor", tok))
                    break

    for start, lit in string_literals(text):
        norm = normalize_prompt(lit)
        if len(norm) >= 20 and norm in corpus_strings:
            lineno = text.count("\n", 0, start) + 1
            hits.append((lineno, "verbatim-corpus", norm[:80]))
    return hits


def scan_all():
    """Scan the tree; return (hits_by_file, corpus_strings_loaded_count)."""
    corpus = load_corpus_strings()
    by_file = {}
    for path, rel in iter_scanned_files():
        hits = scan_file(path, rel, corpus)
        if hits:
            by_file[rel] = hits
    return by_file, len(corpus)


def scan_and_report():
    """Run the scan, print every hit, and return the exit code (0 = clean)."""
    by_file, corpus_count = scan_all()
    if by_file:
        for rel in sorted(by_file):
            for lineno, kind, detail in sorted(by_file[rel]):
                print(f"{rel}:{lineno}: [{kind}] {detail}")
        print(f"CONTAMINATION_FOUND: {sum(len(v) for v in by_file.values())} hit(s) "
              f"across {len(by_file)} file(s) (corpus strings loaded: {corpus_count})")
        return 1
    print(f"CONTAMINATION_SCAN_CLEAN: 0 matches "
          f"(corpus strings loaded: {corpus_count})")
    return 0


if __name__ == "__main__":
    sys.exit(scan_and_report())
