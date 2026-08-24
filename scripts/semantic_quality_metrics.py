#!/usr/bin/env python3
"""PromptVault Semantic Quality Benchmark — metrics computation.

Usage: python3 scripts/semantic_quality_metrics.py <pv-results.json> <gold.json> <cases.json> [--split cal|hold]
Computes all benchmark metrics from the real-engine results vs the reference gold.

Methodology protocol (fail-closed):
- The results artifact must carry a `split` header ("development" | "holdout"
  | "calibration"); old mixed v2 artifacts (development+holdout combined)
  are refused.
- Contrast pairs are derived from the `pair` field of the case file, not from
  a hardcoded list. A pair declared in the case file whose member is missing
  from results or gold is marked NOT_EVALUATED and forces the non-zero exit
  flag `pair_checks_complete: false`. Pairs are never silently skipped.
"""
import json
import sys
import math
import random
from collections import Counter

BAND_ORDER = {'BROKEN': 0, 'POOR': 1, 'FAIR': 2, 'GOOD': 3, 'EXCELLENT': 4}
BAND = lambda s: 'EXCELLENT' if s >= 85 else 'GOOD' if s >= 70 else 'FAIR' if s >= 55 else 'POOR' if s >= 40 else 'BROKEN'

# PV criterion -> reference criterion mapping for missing-info / recommendation matching
CRIT_MAP = {
    'Rollendefinition': None,  # no direct ref criterion (persona) — structural advice only
    'Zieldefinition': 'GOAL_CLARITY',
    'Kontextqualität': 'NECESSARY_CONTEXT',
    'Eingabendefinition': 'INPUT_DEFINITION',
    'Vorgehensbeschreibung': 'ACTIONABILITY',
    'Ausgabeformat': 'OUTPUT_CONTRACT',
    'Qualitätsanforderungen': 'CONSTRAINT_RELEVANCE',
    'Sicherheitsgrenzen': 'SAFETY_PRIVACY_BOUNDARIES',
    'Klarheit': 'AMBIGUITY_CONTROL',
    'Wiederverwendbarkeit': 'REUSABILITY',
}

# keyword categories for matching free-text reference missing_information to PV criteria
MISS_KEYWORDS = {
    'Zieldefinition': ['goal', 'ziel', 'task', 'aufgabe', 'objective', 'deliverable', 'what to', 'purpose', 'zweck'],
    'Kontextqualität': ['context', 'kontext', 'background', 'hintergrund', 'audience', 'zielgruppe', 'system', 'environment', 'umgebung', 'project', 'projekt'],
    'Eingabendefinition': ['input', 'eingabe', 'file', 'datei', 'source', 'quelle', 'data', 'daten', 'parameter', 'pull request', 'text', 'article', 'artikel', 'notes', 'customer', 'kunde', 'client'],
    'Vorgehensbeschreibung': ['step', 'schritt', 'procedure', 'vorgehen', 'how to', 'process', 'ablauf', 'plan', 'format'],
    'Ausgabeformat': ['format', 'output', 'ausgabe', 'response', 'antwort', 'deliverable', 'length', 'länge', 'zeic'],
    'Qualitätsanforderungen': ['quality', 'qualität', 'criteria', 'kriterien', 'acceptance', 'check', 'prüf'],
    'Sicherheitsgrenzen': ['safety', 'sicherheit', 'privacy', 'datenschutz', 'boundary', 'grenze', 'secret', 'pii', 'personal'],
    'Klarheit': ['clarify', 'klar', 'specify', 'spezifiz', 'define', 'define', 'explicit', 'ambigu', 'unklar', 'bedeut', 'what you mean'],
    'Wiederverwendbarkeit': ['reus', 'wiederverwend', 'template', 'placeholder', 'parametr', 'generic', 'generisch'],
}


def match_ref_missing_to_criterion(text: str):
    t = text.lower()
    for crit, kws in MISS_KEYWORDS.items():
        if any(k in t for k in kws):
            return crit
    return None


def spearman(xs, ys):
    n = len(xs)
    def rank(v):
        order = sorted(range(n), key=lambda i: v[i])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                ranks[order[k]] = avg
            i = j + 1
        return ranks
    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = math.sqrt(sum((rx[i] - mx) ** 2 for i in range(n)))
    dy = math.sqrt(sum((ry[i] - my) ** 2 for i in range(n)))
    if dx == 0 or dy == 0:
        return 0.0
    return num / (dx * dy)


def load_pv_results(pv_path):
    """Load results, enforcing the split-separation protocol."""
    with open(pv_path) as f:
        artifact = json.load(f)
    if 'split' not in artifact:
        sys.exit(f'REFUSED: {pv_path} has no "split" header '
                 f'(old combined v2 artifacts are not accepted; re-run the runner per split).')
    results = artifact['results']
    return artifact, {r['id']: r for r in results}


def evaluate_pair_checks(pv, gold, cases):
    """Evaluate every contrast pair declared in the case file.

    Fail-closed: a pair declared in the case file whose member is missing from
    results or gold is NOT_EVALUATED and sets `pair_checks_complete` to false.
    Returns (checks, complete, pair_members) where pair_members maps a pair
    label (e.g. "A1") to its case id.
    """
    # group case ids by their declared pair (A1/A2, G1/G2, H1/H2, ...)
    pairs = {}
    for c in cases.values():
        pr = c.get('pair')
        if pr:
            pairs.setdefault(pr, []).append(c['id'])

    pair_members = {pr: ids[0] for pr, ids in pairs.items() if len(ids) == 1}

    # group pair labels into pair groups (prefix before the trailing 1/2)
    groups = {}
    for pr in sorted(pairs):
        stem = pr[:-1]
        groups.setdefault(stem, []).append(pr)

    checks = {}
    complete = True
    for stem, members in sorted(groups.items()):
        ids = [i for pr in members for i in pairs[pr]]
        label = f'{stem} ({",".join(sorted(members))})'
        missing = [i for i in ids if i not in pv or i not in gold]
        if len(ids) < 2 or missing:
            checks[label] = 'NOT_EVALUATED'
            if missing:
                checks[f'{stem} missing members'] = missing
            complete = False
            continue

        scores = {i: pv[i]['overall_score'] for i in ids}
        # pair semantics by stem (v1 + v2 contracts)
        if stem == 'A':
            # A1 terse-good >= A2 (DE/EN terse-good symmetry)
            checks[label] = scores[pairs['A1'][0]] >= scores[pairs['A2'][0]]
        elif stem == 'B':
            # B2 coherent > B1 keyword-stuffed
            checks[label] = scores[pairs['B2'][0]] > scores[pairs['B1'][0]]
        elif stem == 'C':
            # C2 vs C1 cosmetic gain <= 10
            checks[label] = abs(scores[pairs['C2'][0]] - scores[pairs['C1'][0]]) <= 10
        elif stem == 'D':
            # D2 real context improves >= 20
            checks[label] = scores[pairs['D2'][0]] - scores[pairs['D1'][0]] >= 20
        elif stem == 'E':
            # E1/E2 guideline vs task both reasonable (within 2 bands)
            checks[label] = abs(scores[pairs['E1'][0]] - scores[pairs['E2'][0]]) <= 30
        elif stem == 'F':
            # F2 vs F1 safety boilerplate not inflating > 5
            checks[label] = scores[pairs['F2'][0]] - scores[pairs['F1'][0]] <= 5
        elif stem == 'G':
            # G1/G2 ambiguity pair: within 1 band (score within 15 points)
            checks[label] = abs(scores[pairs['G1'][0]] - scores[pairs['G2'][0]]) <= 15
        elif stem == 'H':
            # H1 terse-good vs H2 boilerplate-noise: appending a compliance
            # guardrail must not inflate more than 5 points
            checks[label] = scores[pairs['H2'][0]] - scores[pairs['H1'][0]] <= 5
        else:
            checks[label] = 'UNKNOWN_PAIR_SEMANTICS'
            complete = False
    return checks, complete, pair_members


def main():
    pv_path, gold_path, cases_path = sys.argv[1], sys.argv[2], sys.argv[3]
    artifact, pv = load_pv_results(pv_path)
    gold = {g['id']: g for g in json.load(open(gold_path))}
    cases = {c['id']: c for c in json.load(open(cases_path))}
    ids = [i for i in cases if i in pv and i in gold]

    pvs = [pv[i]['overall_score'] for i in ids]
    refs = [gold[i]['overall_score'] for i in ids]

    mae = sum(abs(p - r) for p, r in zip(pvs, refs)) / len(ids)
    _sorted_ae = sorted(abs(p - r) for p, r in zip(pvs, refs))
    med_ae = (_sorted_ae[len(ids) // 2] + _sorted_ae[(len(ids) - 1) // 2]) / 2.0
    rho = spearman(pvs, refs)
    exact_band = sum(1 for i in ids if BAND(pv[i]['overall_score']) == gold[i]['quality_band']) / len(ids)
    within_one = sum(1 for i in ids
                     if abs(BAND_ORDER[BAND(pv[i]['overall_score'])] - BAND_ORDER[gold[i]['quality_band']]) <= 1) / len(ids)

    # critical false high/low
    fh = [i for i in ids if gold[i]['quality_band'] in ('POOR', 'BROKEN') and pv[i]['overall_score'] >= 70]
    fl = [i for i in ids if gold[i]['quality_band'] in ('GOOD', 'EXCELLENT') and pv[i]['overall_score'] < 40]
    fh_rate = len(fh) / max(1, sum(1 for i in ids if gold[i]['quality_band'] in ('POOR', 'BROKEN')))
    fl_rate = len(fl) / max(1, sum(1 for i in ids if gold[i]['quality_band'] in ('GOOD', 'EXCELLENT')))

    # contrast pairs — derived dynamically from the case file, fail-closed
    pair_checks, pair_checks_complete, pair_members = evaluate_pair_checks(pv, gold, cases)

    # pairwise ordering accuracy over pairs-of-cases: contrast pairs + seeded random pairs
    rng = random.Random(20260819)
    pairs = []
    for k in ['A', 'B', 'D', 'F']:
        if f'{k}1' in pair_members and f'{k}2' in pair_members:
            pairs.append((pair_members[f'{k}1'], pair_members[f'{k}2']))
    all_ids = list(ids)
    idx = rng.sample(range(len(all_ids)), min(54, len(all_ids)))
    for j in range(0, len(idx) - 1, 2):
        pairs.append((all_ids[idx[j]], all_ids[idx[j + 1]]))
    correct = 0
    for (i, j) in pairs:
        if i == j:
            continue
        pv_sign = 1 if pv[i]['overall_score'] > pv[j]['overall_score'] else -1
        ref_sign = 1 if gold[i]['overall_score'] > gold[j]['overall_score'] else -1
        if (pv[i]['overall_score'] == pv[j]['overall_score']) or (gold[i]['overall_score'] == gold[j]['overall_score']):
            continue
        if pv_sign == ref_sign:
            correct += 1
    ordered = [(i, j) for (i, j) in pairs if i != j and pv[i]['overall_score'] != pv[j]['overall_score'] and gold[i]['overall_score'] != gold[j]['overall_score']]
    ordering_acc = sum(1 for (i, j) in ordered if (pv[i]['overall_score'] > pv[j]['overall_score']) == (gold[i]['overall_score'] > gold[j]['overall_score'])) / len(ordered) if ordered else 0.0

    # guideline/task routing
    # R2 engine records `content_kind` (guideline/template/task) per result so
    # templates (which carry "Scope/Zweck" in R2) are not miscounted as
    # guidelines. Legacy result files without `content_kind` fall back to the
    # "Scope/Zweck" probe (`guideline_routed`).
    routed = {r['id']: r['guideline_routed'] for r in json.load(open(pv_path))['results']}
    results_by_id = {r['id']: r for r in json.load(open(pv_path))['results']}
    routing_ok = 0
    for i in ids:
        r = results_by_id.get(i, {})
        if 'content_kind' in r:
            engine_kind = r['content_kind']
            expected = cases[i]['kind']
            routing_ok += int(engine_kind == expected)
        else:
            ck = cases[i]['kind']
            if (ck == 'guideline' and routed[i]) or (ck in ('task', 'template') and not routed[i]):
                routing_ok += 1
    routing_acc = routing_ok / len(ids)
    guide_total = sum(1 for i in ids if cases[i]['kind'] == 'guideline')
    guide_ok = sum(1 for i in ids
                   if cases[i]['kind'] == 'guideline' and
                   results_by_id.get(i, {}).get('content_kind') == 'guideline')

    # missing-info precision/recall/FPR
    tp = fp = fn = tn = 0
    for i in ids:
        ref_miss = set()
        for m in gold[i].get('missing_information', []):
            c = match_ref_missing_to_criterion(m)
            if c:
                ref_miss.add(c)
        pv_miss = set(pv[i]['missing_sections'])
        inter = pv_miss & ref_miss
        tp += len(inter)
        fp += len(pv_miss - ref_miss)
        fn += len(ref_miss - pv_miss)
        # FPR over criteria reference considers satisfied
        for crit in CRIT_MAP:
            rc = CRIT_MAP[crit]
            if rc and gold[i].get('criteria') and isinstance(gold[i]['criteria'].get(rc), (int, float)) and gold[i]['criteria'][rc] >= 5:
                if crit in pv_miss:
                    fp += 1
                else:
                    tn += 1
    mi_prec = tp / (tp + fp) if (tp + fp) else 0.0
    mi_rec = tp / (tp + fn) if (tp + fn) else 0.0
    mi_fpr = fp / (fp + tn) if (fp + tn) else 0.0

    # recommendation usefulness: PV recs are per-criterion templates; useful if
    # criterion is genuinely weak per reference
    rec_total = rec_useful = 0
    for i in ids:
        for rname in pv[i]['recommendations']:
            rec_total += 1
            crit = None
            # Match by criterion via distinguishing keywords (DE + EN variants)
            for cname, keys in {
                'Zieldefinition': ['Ziel', 'goal', 'your task'],
                'Kontextqualität': ['Kontext', 'context'],
                'Eingabendefinition': ['Eingaben', 'placeholders', 'inputs'],
                'Vorgehensbeschreibung': ['Vorgehen', 'procedure', 'Structure the'],
                'Ausgabeformat': ['Ausgabeformat', 'output format', 'Specify the output'],
                'Qualitätsanforderungen': ['Prüfkriterien', 'acceptance criteria', 'checks'],
                'Sicherheitsgrenzen': ['Grenzen', 'boundaries', 'Define boundaries'],
                'Klarheit': ['Lesbarkeit', 'readability'],
                'Wiederverwendbarkeit': ['generischer', 'generic'],
                'Rollendefinition': ['Rolle', 'role'],
                'Scope/Zweck': ['Scope/Zweck', 'guideline scope', 'scope'],
                'Regel-Spezifität': ['Regel-Spezifität', 'imperative rules', 'Rules'],
                'Constraint-Klarheit': ['Constraint', 'constraints'],
                'Anwendbarkeit': ['Anwendbarkeit', 'Geltungsbereich', 'scope of the guideline', 'applies'],
                'Output-Disziplin': ['Output-Disziplin', 'output discipline'],
                'Konsistenz/Struktur': ['Konsistenz', 'consistency'],
            }.items():
                if any(k.lower() in rname.lower() for k in keys):
                    crit = cname
                    break
            if crit is None:
                continue
            rc = CRIT_MAP.get(crit)
            if rc and gold[i].get('criteria') and isinstance(gold[i]['criteria'].get(rc), (int, float)) and gold[i]['criteria'][rc] < 5:
                rec_useful += 1
            elif crit in ('Scope/Zweck', 'Regel-Spezifität', 'Constraint-Klarheit', 'Anwendbarkeit', 'Output-Disziplin', 'Konsistenz/Struktur'):
                # guideline criteria map loosely to reference criteria; count
                # as useful when a closely related reference criterion is low
                related = {
                    'Scope/Zweck': ['GOAL_CLARITY', 'NECESSARY_CONTEXT'],
                    'Regel-Spezifität': ['ACTIONABILITY', 'AMBIGUITY_CONTROL'],
                    'Constraint-Klarheit': ['CONSTRAINT_RELEVANCE', 'INTERNAL_CONSISTENCY'],
                    'Anwendbarkeit': ['NECESSARY_CONTEXT'],
                    'Output-Disziplin': ['OUTPUT_CONTRACT'],
                    'Konsistenz/Struktur': ['INTERNAL_CONSISTENCY', 'AMBIGUITY_CONTROL'],
                }.get(crit, [])
                if any(gold[i].get('criteria') and isinstance(gold[i]['criteria'].get(rc), (int, float)) and gold[i]['criteria'][rc] < 5 for rc in related):
                    rec_useful += 1
    rec_usefulness = rec_useful / max(1, rec_total)

    # gaming resistance (adversarial must not be EXCELLENT; >=10/12 in POOR/BROKEN)
    adv = [i for i in ids if cases[i].get('adversarial_pattern')]
    adv_excellent = [i for i in adv if BAND(pv[i]['overall_score']) == 'EXCELLENT']
    adv_poor_broken = [i for i in adv if BAND(pv[i]['overall_score']) in ('POOR', 'BROKEN')]
    gaming_res = 1.0 - (len(adv_excellent) / len(adv)) if adv else 1.0

    # terse fairness (terse-excellent stratum, PV>=70)
    terse = [i for i in ids if 'terse' in (cases[i].get('tags') or []) and 'excellent' in (cases[i].get('tags') or [])]
    terse_low = [i for i in terse if pv[i]['overall_score'] < 70]
    terse_fairness = (len(terse) - len(terse_low)) / len(terse) if terse else 1.0
    terse_mean = sum(pv[i]['overall_score'] for i in terse) / len(terse) if terse else 0.0

    print(json.dumps({
        'n': len(ids),
        'split': artifact.get('split'),
        'mae': round(mae, 2),
        'median_ae': round(med_ae, 2),
        'spearman': round(rho, 4),
        'exact_band': round(exact_band, 4),
        'within_one_band': round(within_one, 4),
        'false_high_cases': fh,
        'false_high_rate': round(fh_rate, 4),
        'false_low_cases': fl,
        'false_low_rate': round(fl_rate, 4),
        'pair_checks': pair_checks,
        'pair_checks_complete': pair_checks_complete,
        'pairwise_ordering_acc': round(ordering_acc, 4),
        'pairwise_ordered_pairs': len(ordered),
        'routing_acc': round(routing_acc, 4),
        'guideline_routed': f'{guide_ok}/{guide_total}',
        'missing_info_precision': round(mi_prec, 4),
        'missing_info_recall': round(mi_rec, 4),
        'missing_info_fpr': round(mi_fpr, 4),
        'recommendation_usefulness': round(rec_usefulness, 4),
        'recommendations_total': rec_total,
        'gaming_resistance': round(gaming_res, 4),
        'adversarial_excellent': adv_excellent,
        'adversarial_poor_broken_count': len(adv_poor_broken),
        'adversarial_total': len(adv),
        'terse_fairness': round(terse_fairness, 4),
        'terse_low_cases': terse_low,
        'terse_mean': round(terse_mean, 2),
    }, indent=1, ensure_ascii=False))
    if not pair_checks_complete:
        sys.exit(f'PAIR_CHECKS_INCOMPLETE: at least one declared pair could not be evaluated '
                 f'(missing member in results/gold) — see pair_checks above. '
                 f'Exit code 1 (fail-closed).')


if __name__ == '__main__':
    main()
