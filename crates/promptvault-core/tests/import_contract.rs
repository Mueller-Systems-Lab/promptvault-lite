//! Import / migration contract of PromptVault Lite (Issue #296).
//!
//! #296 wants to absorb any unique material from the external `prompt_archiv`
//! repository and then retire it. That repository is **not accessible** (live
//! probe 2026-10-09: 404 in both the organisation and the personal account), so
//! its concrete export format cannot be inspected. What *can* be established —
//! and is established here — is the other half of the contract: exactly what
//! PromptVault Lite ingests, what it preserves, and what it drops.
//!
//! That is the acceptance side of a migration: a source format is migratable
//! losslessly if and only if it can be expressed within the guarantees pinned
//! below. Each test states its verdict explicitly:
//!
//!   LOSSLESS · LOSSY_BUT_ACCEPTABLE · INCOMPATIBLE
//!
//! All fixtures are synthetic and created in a temp directory; nothing here
//! touches any real prompt corpus.

use std::fs;
use std::path::Path;

use promptvault_core::scanner::scan_directory;
use tempfile::TempDir;

/// The scanner's documented per-file limit (see `MAX_PROMPT_FILE_SIZE_BYTES`).
const MAX_PROMPT_FILE_SIZE_BYTES: usize = 1_048_576;

fn write(dir: &Path, name: &str, content: &str) {
    fs::write(dir.join(name), content).expect("fixture write");
}

/// The keys PromptVault Lite surfaces as first-class fields today.
const SURFACED_KEYS: [&str; 7] = [
    "title",
    "description",
    "category",
    "version",
    "tags",
    "created",
    "updated",
];

// ---------------------------------------------------------------------------
// 1. LOSSLESS: the surfaced key set round-trips into the item model
// ---------------------------------------------------------------------------

#[test]
fn surfaced_frontmatter_keys_map_losslessly() {
    let dir = TempDir::new().unwrap();
    write(
        dir.path(),
        "full.md",
        "---\n\
         title: \"Vollständiger Prompt\"\n\
         description: \"Eine Beschreibung\"\n\
         category: coding\n\
         version: \"2.1\"\n\
         tags: [rust, review]\n\
         created: 2026-01-02\n\
         updated: 2026-03-04\n\
         ---\n\n# Inhalt\n\nDer eigentliche Prompt.\n",
    );

    let items = scan_directory(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(items.len(), 1, "one file, one prompt");
    let p = &items[0];

    assert_eq!(p.title, "Vollständiger Prompt");
    assert_eq!(p.description, "Eine Beschreibung");
    assert_eq!(p.category, "coding");
    assert_eq!(p.version, "2.1");
    assert_eq!(p.tags, vec!["rust", "review"]);
    assert_eq!(p.created_at, "2026-01-02");
    assert_eq!(p.updated_at, "2026-03-04");
    assert!(p.content.contains("# Inhalt"));
    assert!(
        !p.content.contains("---"),
        "frontmatter is stripped from content"
    );

    // Everything surfaced is also visible in raw_frontmatter, so a migration
    // can be verified key by key.
    for key in SURFACED_KEYS {
        assert!(
            !p.raw_frontmatter[key].is_null(),
            "surfaced key '{key}' missing from raw_frontmatter"
        );
    }
}

// ---------------------------------------------------------------------------
// 2. LOSSLESS at ingest / LOSSY in display: foreign keys are preserved
// ---------------------------------------------------------------------------

#[test]
fn foreign_frontmatter_keys_are_preserved_but_not_surfaced() {
    // A source archive is likely to carry keys this product has no field for
    // (its own ids, import batches, licenses). They must not be dropped on
    // ingest — otherwise a migration would be destructive even though the file
    // itself is untouched.
    let dir = TempDir::new().unwrap();
    write(
        dir.path(),
        "foreign.md",
        "---\n\
         title: Fremdformat\n\
         source_id: arch-12345\n\
         import_batch: 2026-08\n\
         license: CC-BY-4.0\n\
         taxonomy:\n  - kategorie/a\n  - kategorie/b\n\
         ---\n\n# Inhalt\n",
    );

    let items = scan_directory(dir.path().to_str().unwrap()).unwrap();
    let p = &items[0];

    for key in ["source_id", "import_batch", "license", "taxonomy"] {
        assert!(
            !p.raw_frontmatter[key].is_null(),
            "foreign key '{key}' was dropped at ingest (would be LOSSY at ingest)"
        );
    }
    assert_eq!(p.raw_frontmatter["source_id"], "arch-12345");
    assert_eq!(p.raw_frontmatter["license"], "CC-BY-4.0");
    assert_eq!(p.raw_frontmatter["taxonomy"][1], "kategorie/b");

    // …but they are not part of the product's own model, so a *consumer* of the
    // item (UI, export, analysis) does not see them today.
    assert_eq!(p.tags.len(), 0, "foreign keys must not leak into tags");
    assert!(p.description.is_empty());
}

// ---------------------------------------------------------------------------
// 3. LOSSY_BUT_ACCEPTABLE: no frontmatter at all
// ---------------------------------------------------------------------------

#[test]
fn missing_frontmatter_falls_back_to_filename_with_typed_defaults() {
    let dir = TempDir::new().unwrap();
    write(
        dir.path(),
        "nackter-prompt.md",
        "# Nur Inhalt\n\nOhne Frontmatter.\n",
    );

    let items = scan_directory(dir.path().to_str().unwrap()).unwrap();
    let p = &items[0];

    assert_eq!(
        p.title, "nackter-prompt",
        "title falls back to the filename stem"
    );
    assert!(p.description.is_empty(), "no description is invented");
    assert_eq!(p.version, "1.0", "documented default version");
    assert!(p.tags.is_empty());
    // The category falls back to the containing folder name.
    assert_eq!(
        p.category,
        dir.path().file_name().unwrap().to_str().unwrap()
    );
}

// ---------------------------------------------------------------------------
// 4. INCOMPATIBLE: file types outside .md/.markdown/.txt
// ---------------------------------------------------------------------------

#[test]
fn only_markdown_and_text_exports_are_ingestable() {
    let dir = TempDir::new().unwrap();
    write(dir.path(), "a.md", "# Md\n");
    write(dir.path(), "b.markdown", "# Markdown\n");
    write(dir.path(), "c.txt", "# Text\n");
    write(dir.path(), "d.json", "{\"prompt\":\"not ingestable\"}\n");
    write(dir.path(), "e.yaml", "prompt: not ingestable\n");
    write(dir.path(), "f.csv", "prompt\nnot ingestable\n");
    write(dir.path(), "g.sqlite", "binary-ish\n");

    let mut names: Vec<String> = scan_directory(dir.path().to_str().unwrap())
        .unwrap()
        .into_iter()
        .map(|p| p.file_name)
        .collect();
    names.sort();

    assert_eq!(
        names,
        vec!["a.md", "b.markdown", "c.txt"],
        "only .md/.markdown/.txt are ingestable"
    );
}

// ---------------------------------------------------------------------------
// 5. INCOMPATIBLE: anything above the 1 MiB per-file limit
// ---------------------------------------------------------------------------

#[test]
fn oversized_exports_are_skipped_silently() {
    // A migration must know this: a source prompt larger than 1 MiB does not
    // become a smaller prompt, it becomes *no* prompt.
    let dir = TempDir::new().unwrap();
    let big = "x".repeat(MAX_PROMPT_FILE_SIZE_BYTES + 1);
    write(dir.path(), "too-big.md", &big);
    write(
        dir.path(),
        "at-limit.md",
        &"y".repeat(MAX_PROMPT_FILE_SIZE_BYTES),
    );

    let names: Vec<String> = scan_directory(dir.path().to_str().unwrap())
        .unwrap()
        .into_iter()
        .map(|p| p.file_name)
        .collect();

    assert!(
        names.contains(&"at-limit.md".to_string()),
        "exactly at the limit is fine"
    );
    assert!(
        !names.contains(&"too-big.md".to_string()),
        "one byte over the limit is dropped entirely"
    );
}

// ---------------------------------------------------------------------------
// 6. Migration consequence: identity is path-derived, not carried
// ---------------------------------------------------------------------------

#[test]
fn identity_is_derived_from_the_path_so_ids_are_not_portable() {
    let a = TempDir::new().unwrap();
    let b = TempDir::new().unwrap();
    let body = "---\ntitle: Gleich\n---\n\n# Inhalt\n";
    write(a.path(), "same.md", body);
    write(b.path(), "same.md", body);

    let ra = scan_directory(a.path().to_str().unwrap()).unwrap();
    let rb = scan_directory(b.path().to_str().unwrap()).unwrap();

    assert_ne!(
        ra[0].id, rb[0].id,
        "identical content at a different path gets a different id"
    );

    // Re-scanning the same path is stable — that is the property favourites
    // rely on across restarts.
    let again = scan_directory(a.path().to_str().unwrap()).unwrap();
    assert_eq!(
        ra[0].id, again[0].id,
        "the id is stable for an unchanged path"
    );
}

// ---------------------------------------------------------------------------
// 7. INCOMPATIBLE: non-UTF-8 sources
// ---------------------------------------------------------------------------

#[test]
fn non_utf8_files_are_skipped_without_failing_the_scan() {
    let dir = TempDir::new().unwrap();
    write(dir.path(), "good.md", "# Gut\n");
    // 0xFF is never valid UTF-8 (a latin-1 / binary export would look like this).
    fs::write(dir.path().join("latin1.md"), [0x23, 0x20, 0xFF, 0xFE, 0x0A]).unwrap();

    let items = scan_directory(dir.path().to_str().unwrap()).unwrap();
    let names: Vec<&str> = items.iter().map(|p| p.file_name.as_str()).collect();
    assert!(names.contains(&"good.md"), "the readable file survives");
    assert!(
        !names.contains(&"latin1.md"),
        "a non-UTF-8 file yields no prompt (migration must re-encode)"
    );
}
