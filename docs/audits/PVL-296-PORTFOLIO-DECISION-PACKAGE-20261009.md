# Issue #296 — Portfolio Decision Package: absorb `prompt_archiv`, freeze as harvest/sale asset

- **Date:** 2026-10-09
- **Repository:** `Mueller-Systems-Lab/promptvault-lite` (main = `13ec221`)
- **Status:** **OWNER_PORTFOLIO_DECISION_REQUIRED** — the comparison half is blocked on source access; the executable half is complete and evidenced
- **Scope:** bounded analysis and a decision package. Nothing was archived, deleted or changed in any external repository.

This document replaces prose with two kinds of artefact: a **live accessibility
probe** (so the blocker is a fact, not a recollection) and a **test-enforced
import contract** (so the migration side is verified rather than claimed).

---

## 1. Live accessibility probe of the source repository

`prompt_archiv` is the issue's declared source. Probed live on 2026-10-09 via the
authenticated GitHub API:

| Candidate | Result |
| --- | --- |
| `Mueller-Systems-Lab/prompt_archiv` | 404 |
| `Mueller-Systems-Lab/prompt-archiv` | 404 |
| `Mueller-Systems-Lab/promptarchiv` | 404 |
| `Mueller-Systems-Lab/archiv` | 404 |
| `xxammaxx/prompt_archiv` | 404 |
| `xxammaxx/prompt-archiv` | 404 |

Repository inventories taken at the same time: the organisation holds 25
repositories and the personal account 11; **neither contains a prompt-archive
repository**, and `gh search repos --owner … archiv` returns nothing for either
account. This confirms the 2026-09-30 finding in the issue thread.

**Consequence.** The issue's core work — a source diff, inspection of its
taxonomy/import formats, and absorption of unique material — cannot be executed
or verified. Per the mission's own rule, that is reported as
`BLOCKED_EXTERNAL_OWNER_INPUT`, not guessed.

## 2. Comparison matrix

The matrix is deliberately asymmetric: the PromptVault-Lite column is fully
evidenced, the `prompt_archiv` column is **UNKNOWN everywhere**, because the
repository could not be read. Inferring its properties from the name would be
fabrication.

| Capability | PromptVault-Lite (evidenced) | `prompt_archiv` | Overlap | Unique value | Migration consequence |
| --- | --- | --- | --- | --- | --- |
| Prompt metadata fields | `title`, `description`, `category`, `version`, `tags`, `created`, `updated` — YAML frontmatter, mapped test-locked | UNKNOWN | UNKNOWN | Unknown until read | A source with these keys migrates losslessly; others land in `raw_frontmatter` only |
| Foreign/extra metadata | Preserved in `raw_frontmatter`, **not** surfaced in the model | UNKNOWN | UNKNOWN | Unknown until read | Preserved but invisible → a display-layer gap, not data loss |
| Taxonomy | `category` (frontmatter or folder) + free-form `tags`; no hierarchy, no controlled vocabulary | UNKNOWN | UNKNOWN | Unknown until read | A hierarchical source taxonomy loses its structure (flattening) |
| Import formats | Directory scan of `.md`/`.markdown`/`.txt` ≤ 1 MiB, recursive, symlink-contained | UNKNOWN | UNKNOWN | Unknown until read | Non-text or >1 MiB exports are **not** ingestable as-is |
| Deduplication | **None.** Identity is the canonical file path (deterministic UUIDv5); identical content in two paths is two prompts | UNKNOWN | UNKNOWN | If `prompt_archiv` has content-level dedup/normalisation, that is genuinely unique | A migration from a dedup'd source will re-introduce what it had merged |
| Normalisation | Path canonicalisation, size cap, UTF-8 requirement, extension filter | UNKNOWN | UNKNOWN | Unknown until read | Non-UTF-8 sources must be re-encoded first |
| Example datasets | Synthetic fixtures only in-repo; no shipped corpus | UNKNOWN | UNKNOWN | Unknown until read | Non-sensitive examples would need an explicit import step |
| Migration utilities | **None** beyond manual file placement + the scan itself | UNKNOWN | UNKNOWN | Unknown until read | A one-off conversion script would have to be written once the source format is known |
| Export | JSON / Markdown / ZIP | UNKNOWN | UNKNOWN | Unknown until read | Round-trip could be made lossless for *this* model; cross-tool round-trip unverifiable |
| Analysis / quality | Bounded offline analyser (criteria, hygiene, variants, optimizer), embeddings mock-only | UNKNOWN | UNKNOWN | Unknown until read | Not a migration concern |
| Distribution | Linux `.deb`/`.rpm`/AppImage, Docker/Compose, LAN server | UNKNOWN | UNKNOWN | Unknown until read | — |
| Licence / SBOM | MIT; **no SBOM or reproducible-build attestation** | UNKNOWN | UNKNOWN | Unknown until read | The sale-asset gap (#296's own goal) |
| Maintenance burden | Single active repository, 1.13.2 released, CI green | UNKNOWN (not accessible in ~4 weeks) | — | — | Two products to maintain vs. one |

## 3. Compatibility results (synthetic, test-enforced)

Established against **this** product's ingest path, with synthetic fixtures
(`crates/promptvault-core/tests/import_contract.rs`, 7 tests, all green). These
are the guarantees any migration must fit inside; the verdicts are per data
structure, not per repository.

| Data structure | Verdict | Evidence |
| --- | --- | --- |
| The seven surfaced frontmatter keys | **LOSSLESS** | `surfaced_frontmatter_keys_map_losslessly` |
| Foreign frontmatter keys | **LOSSLESS at ingest, LOSSY in display** | `foreign_frontmatter_keys_are_preserved_but_not_surfaced` — preserved in `raw_frontmatter`, absent from the model |
| Missing frontmatter | **LOSSY_BUT_ACCEPTABLE** | `missing_frontmatter_falls_back_to_filename_with_typed_defaults` — title from the filename, no invented description |
| `.md` / `.markdown` / `.txt` | **LOSSLESS** | `only_markdown_and_text_exports_are_ingestable` |
| JSON / YAML / CSV / SQLite exports | **INCOMPATIBLE** without a converter | same test |
| Files > 1 MiB | **INCOMPATIBLE** — dropped entirely, not truncated | `oversized_exports_are_skipped_silently` |
| Prompt identity / ids | **INCOMPATIBLE as carried data** — ids are path-derived, so they are not portable; re-scanning the same path is stable | `identity_is_derived_from_the_path_so_ids_are_not_portable` |
| Non-UTF-8 (e.g. latin-1) files | **INCOMPATIBLE** without re-encoding | `non_utf8_files_are_skipped_without_failing_the_scan` |
| Source-side taxonomy hierarchy | **UNKNOWN** | needs the source; today the model has flat `category` + `tags` |

**Net:** a migration is losslessly possible for text exports whose metadata fits
the seven surfaced keys. It is lossy for foreign keys (invisible), hierarchy
(flattened), dedup (re-introduced) and identity (re-derived).

## 4. Items from the issue thread that are now resolved

The 2026-09-30/10-01 comments listed three required owner decisions. Two have
since been satisfied from this repository:

| Then-open item | Now | Evidence |
| --- | --- | --- |
| "publish the v1.12.0 GitHub Release from a capable host" | **DONE** | v1.12.0, v1.13.0, v1.13.1 and **v1.13.2** are published; v1.13.2 was built, verified and published by the automated release pipeline (`Release (Linux)` run on tag `v1.13.2`) |
| "stable release, clean licence, compact demo, local-first positioning" | **DONE** | MIT licence; v1.13.2 Latest; website + synthetic-data screenshots; README/website consistent |
| "SBOM / reproducible-build attestation" | **OPEN, actionable** | Not present in the repository. This is the remaining executable work item for the harvest/sale goal (see option C) |
| "access to prompt_archiv, or confirm it is retired" | **BLOCKED** | live probe in §1 |

## 5. Owner decision package

Four options. Costs are stated in work units, not hours, and every reversible
option says so.

### A. RETIRE `prompt_archiv` after a verified migration path

- **Benefit:** one product identity; the maintenance burden of the second
  repository ends; the harvest/sale story becomes unambiguous.
- **Cost:** requires the source to be readable (to diff it) *and* a completed
  import that preserves what matters.
- **Risk:** **high if executed blind** — retiring a source whose contents are
  unknown can destroy unique material irreversibly.
- **Required work:** source access → source diff → import of unique material →
  compatibility evidence → freeze.
- **Reversibility:** **low.** Deleting or archiving the source is the least
  reversible option in this package.
- **Executable today?** **No.** §1 blocks the first step.

### B. KEEP STANDALONE, document the distinct purpose

- **Benefit:** no migration risk at all; both products keep their own evolution.
- **Cost:** two repositories to maintain and two identities to explain.
- **Risk:** low; the risk is *drift* (the two diverge further), not damage.
- **Required work:** a short scope statement per repository; remove the
  "consolidation" expectation from the roadmap.
- **Reversibility:** high — a later consolidation remains possible.
- **Executable today?** Yes, but it contradicts #296's stated goal, so it is an
  owner decision, not a default.

### C. MERGE the remaining unique functionality as a bounded migration epic

- **Benefit:** keeps the goal, bounds the work, and produces the evidence the
  retirement gate needs.
- **Cost:** one bounded epic (source diff → converter → import tests →
  retirement).
- **Risk:** medium — scoped by construction, but the source format is unknown, so
  the epic cannot be estimated before access.
- **Required work:** (1) owner provides source access or an export; (2) write
  `prompt_archiv → PromptVault-Lite` conversion for the LOSSLESS subset;
  (3) extend the model for whatever the diff shows as unique (hierarchy and
  content-level dedup are the two *plausible* candidates — not asserted);
  (4) **the SBOM/reproducible-build attestation**, which is executable **now**
  and independent of the source.
- **Reversibility:** high for the import work (files remain untouched).
- **Executable today?** **Partially**: the SBOM item is; the converter is not.

### D. DEFER with an explicit review date and a named unblocker

- **Benefit:** honest about the blocker; no irreversible action on unread data.
- **Cost:** the consolidation goal stays open.
- **Risk:** low — but the issue should not silently rot; a review date is part of
  the option.
- **Required work:** none beyond the review; the unblocker is named (owner
  supplies the source or declares it retired).
- **Reversibility:** high.

### Recommendation (non-binding)

**C, gated on the owner input, with D's discipline meanwhile.** Concretely:
the only part of the goal that is executable without the source is the
**SBOM/reproducible-build attestation**, and it is the part the harvest/sale
strategy actually depends on. Everything else needs the owner to either provide
the source or declare that it no longer exists — at which point A becomes
achievable, or the requirement can be withdrawn and the issue closed on that
decision.

The decision this issue needs from the owner is therefore exactly two answers:

1. **Source:** provide access to `prompt_archiv` (repository, archive or export),
   or declare it retired/deleted so the requirement can be withdrawn.
2. **Sale asset:** should an SBOM / reproducible-build attestation be produced
   for the harvest/sale goal? (This one is executable immediately and does not
   depend on answer 1.)

No irreversible portfolio action is taken on the owner's behalf by this package.
