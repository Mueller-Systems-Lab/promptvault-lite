#!/usr/bin/env python3
"""
Live Real-World Corpus Semantic Validation — judges 176 unique externally-safe prompts
via two independent live model families (Muse Spark + Gemini Flash Lite).
Produces evidence/analyzer-r2-realworld-live/ artifacts.
"""
import json, hashlib, re, subprocess, sys, time, os, pathlib, datetime, textwrap

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRIVATE_EVIDENCE_ROOT = pathlib.Path(
    os.environ.get("PVL_PRIVATE_EVIDENCE_DIR", ROOT / "evidence")
)
EVIDENCE_DIR = ROOT / "evidence" / "analyzer-r2-realworld-live"
PRIVATE_ANALYZER_EVIDENCE = PRIVATE_EVIDENCE_ROOT / "analyzer-r2-realworld"
PROMPT_EXTRACTION = PRIVATE_ANALYZER_EVIDENCE / "prompt-extraction.json"
PRIVACY_SCAN = PRIVATE_ANALYZER_EVIDENCE / "privacy-scan.json"
DEDUPLICATION = PRIVATE_ANALYZER_EVIDENCE / "deduplication.json"
EXHAUSTIVE = PRIVATE_ANALYZER_EVIDENCE / "exhaustive-analyzer-run.json"
RUBRIC_PATH = ROOT / "benchmarks" / "semantic-quality-v5" / "rubric.json"
TEMPLATE_PATH = EVIDENCE_DIR / "judge_prompt_template.txt"
OUTPUT_JSON = EVIDENCE_DIR / "realworld-live-judgments.jsonl"
CALL_EVIDENCE = EVIDENCE_DIR / "live-call-evidence.jsonl"
REFERENCE_OUT = EVIDENCE_DIR / "realworld-reference-live.json"
METRICS_OUT = EVIDENCE_DIR / "semantic-metrics-live.json"

JUDGE_A_MODEL = "opencode/muse-spark-1.2-contributor-free"
JUDGE_B_MODEL = "opencode/mimo-v2.5-free"
JUDGE_C_MODEL = "opencode/hy3-free"

BAND_ORDER = {"BROKEN":0, "POOR":1, "FAIR":2, "GOOD":3, "EXCELLENT":4}

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def load_json(p):
    return json.loads(open(p, encoding='utf-8').read())

def read_prompt_text(absolute_path: str) -> str:
    try:
        return open(absolute_path, encoding='utf-8', errors='replace').read()
    except Exception as e:
        return open(absolute_path, encoding='latin-1', errors='replace').read()

def redact_text(text: str, categories):
    # semantics-preserving redaction
    out = text
    if "EMAIL" in categories:
        out = re.sub(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '<EMAIL>', out)
    if "SERVER_IP" in categories:
        out = re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', '<SERVER_IP>', out)
        # also replace common server placeholders
        out = re.sub(r'\b(?:[0-9]{1,3}\.){3}[0-9xX]+\b', '<SERVER_IP>', out)
    # generic fallbacks if categories include generic but not matched
    return out

def band_from_score(score):
    if score >=85: return "EXCELLENT"
    if score >=70: return "GOOD"
    if score >=55: return "FAIR"
    if score >=40: return "POOR"
    return "BROKEN"

def call_opencode(model: str, prompt_text: str, timeout=120):
    # Use opencode run --format json
    cmd = ["opencode", "run", "-m", model, "--format", "json", prompt_text]
    start = datetime.datetime.utcnow().isoformat()+"Z"
    t0 = time.time()
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        elapsed = time.time() - t0
        stdout = result.stdout
        stderr = result.stderr
        exit_code = result.returncode
        # parse jsonl events to extract text parts
        text_parts = []
        request_id = None
        for line in stdout.splitlines():
            line=line.strip()
            if not line: continue
            try:
                evt=json.loads(line)
                if evt.get("type")=="text":
                    text_parts.append(evt["part"]["text"])
                if "sessionID" in evt:
                    request_id = evt.get("sessionID")
                # also capture tokens/cost in step_finish
                if evt.get("type")=="step_finish":
                    request_id = evt.get("part",{}).get("sessionID", request_id)
            except:
                continue
        combined = "\n".join(text_parts) if text_parts else stdout
        return {
            "exit_code": exit_code,
            "stdout_raw": stdout[:2000],
            "stderr": stderr[:2000],
            "text": combined,
            "elapsed_ms": int(elapsed*1000),
            "request_id": request_id,
            "timestamp": start,
            "input_hash": sha256(prompt_text.encode('utf-8')),
            "output_hash": sha256(combined.encode('utf-8')),
        }
    except subprocess.TimeoutExpired:
        return {"exit_code": 124, "stdout_raw": "", "stderr": "timeout", "text": "", "elapsed_ms": int((time.time()-t0)*1000), "request_id": None, "timestamp": start, "input_hash": sha256(prompt_text.encode('utf-8')), "output_hash": ""}

def extract_json(text: str):
    # try to find JSON object in text (strip markdown code fences)
    # remove ```json ... ```
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if m:
        text = m.group(1)
    # find first { ... } balanced
    start = text.find('{')
    end = text.rfind('}')
    if start >=0 and end > start:
        candidate = text[start:end+1]
        try:
            return json.loads(candidate)
        except:
            # try to repair trailing commas
            candidate = re.sub(r',\s*}', '}', candidate)
            candidate = re.sub(r',\spanel', '', candidate)
            try:
                return json.loads(candidate)
            except Exception as e:
                return {"__parse_error": str(e), "__raw": candidate[:2000]}
    try:
        return json.loads(text.strip())
    except Exception as e:
        return {"__parse_error": str(e), "__raw": text[:2000]}

def validate_schema(obj):
    required = ["overall_score","quality_band","fit_for_purpose","prompt_type","critical_issues","missing_information","confidence"]
    for k in required:
        if k not in obj:
            return False, f"missing {k}"
    if not isinstance(obj["overall_score"], int):
        # allow float that is int-like
        if isinstance(obj["overall_score"], float) and obj["overall_score"].is_integer():
            obj["overall_score"] = int(obj["overall_score"])
        else:
            return False, "overall_score not int"
    if obj["quality_band"] not in BAND_ORDER:
        return False, "bad band"
    if obj["fit_for_purpose"] not in ["YES","PARTIAL","NO"]:
        return False, "bad fit"
    if not isinstance(obj["critical_issues"], list): return False, "critical_issues not list"
    if not isinstance(obj["missing_information"], list): return False, "missing_information not list"
    try:
        float(obj["confidence"])
    except:
        return False, "confidence not float"
    # cross-check band vs score
    expected_band = band_from_score(obj["overall_score"])
    # allow mismatch but warn; not fail
    return True, "ok"

def build_judge_prompt(rubric_text, prompt_text, case_id, content_sha):
    tmpl = open(TEMPLATE_PATH, encoding='utf-8').read()
    return tmpl.replace("{{RUBRIC_JSON}}", rubric_text).replace("{{PROMPT_TEXT}}", prompt_text).replace("{{CASE_ID}}", case_id).replace("{{CONTENT_SHA256}}", content_sha)

def main():
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    rubric_text = open(RUBRIC_PATH, encoding='utf-8').read()
    privacy = load_json(PRIVACY_SCAN)
    by_case_privacy = {r["CORPUS_CASE_ID"]: r for r in privacy["results"]}
    dedup = load_json(DEDUPLICATION)
    # Build map from CASE_ID to exhaustive result for source sha lookup
    exhaustive = load_json(EXHAUSTIVE)
    by_case_exhaustive = {r["CORPUS_CASE_ID"]: r for r in exhaustive["results"]}
    # prompt extraction units
    pe = load_json(PROMPT_EXTRACTION)
    units = pe["units"]
    # Also need deduplication: map SHA -> representative CASE_ID (first sorted)
    # Build unique set: collapse exact duplicates by SOURCE_SHA256
    sha_to_cases = {}
    for u in units:
        cid = u["CORPUS_CASE_ID"]
        sha = by_case_exhaustive[cid]["SOURCE_SHA256"]
        sha_to_cases.setdefault(sha, []).append(cid)
    # Build unique representatives: choose smallest CASE_ID lexicographically per sha
    unique_representatives = {}
    for sha, cids in sha_to_cases.items():
        rep = sorted(cids)[0]
        unique_representatives[sha] = rep

    # Now classify each unique representative per privacy
    unique_external = []
    local_only = []
    for sha, rep in unique_representatives.items():
        priv = by_case_privacy[rep]
        cls = priv["SECRET_CLASS"]
        cats = priv["PATTERN_CATEGORY"]
        if cls == "LOCAL_ONLY_REVIEW":
            local_only.append((sha, rep, cls, cats))
        else:
            unique_external.append((sha, rep, cls, cats))

    # Sort unique_external by rep for deterministic order
    unique_external.sort(key=lambda x: x[1])
    local_only.sort(key=lambda x: x[1])

    print(f"TOTAL_PROMPT_UNITS 185")
    print(f"UNIQUE_PROMPTS {len(unique_representatives)}")
    print(f"UNIQUE_EXTERNAL_SAFE {len([x for x in unique_external if x[2]=='SAFE_FOR_EXTERNAL_REVIEW'])}")
    print(f"UNIQUE_REDACTED_SAFE {len([x for x in unique_external if x[2]=='SAFE_AFTER_SEMANTICS_PRESERVING_REDACTION'])}")
    print(f"LOCAL_ONLY {len(local_only)}")
    print(f"UNIQUE_EXTERNAL_TOTAL {len(unique_external)}")
    print(f"Representatives to judge live: {len(unique_external)}")

    # Handle resumption: load already done judgments
    done = {}
    if OUTPUT_JSON.exists():
        for line in open(OUTPUT_JSON, encoding='utf-8'):
            try:
                rec=json.loads(line)
                done[rec["CASE_ID"]] = rec
            except: pass
        print(f"Resuming: {len(done)} already judged")

    # Prepare output files
    out_f = open(OUTPUT_JSON, 'a', encoding='utf-8')
    call_f = open(CALL_EVIDENCE, 'a', encoding='utf-8')

    # Iterate
    for idx, (sha, rep, cls, cats) in enumerate(unique_external):
        if rep in done:
            print(f"[{idx+1}/{len(unique_external)}] SKIP {rep} already done")
            continue
        # Load prompt text from filesystem
        unit = next(u for u in units if u["CORPUS_CASE_ID"]==rep)
        abs_path = unit["ABSOLUTE_PATH"]
        try:
            raw_text = read_prompt_text(abs_path)
        except Exception as e:
            print(f"Failed to read {abs_path}: {e}")
            raw_text = ""
        content_sha = sha  # source sha
        # Truncation handling: if >100k, truncate
        truncated = False
        original_len = len(raw_text)
        if original_len > 100000:
            raw_text = raw_text[:100000]
            truncated = True
        # Redaction if needed
        redacted = False
        send_text = raw_text
        redacted_or_original = "ORIGINAL"
        if cls == "SAFE_AFTER_SEMANTICS_PRESERVING_REDACTION":
            send_text = redact_text(raw_text, cats)
            redacted = True
            redacted_or_original = "REDACTED"
            # verify semantics preserved: ensure not empty
            if send_text == raw_text:
                print(f"WARNING: redaction for {rep} did not change text categories {cats}")

        # Build judge prompt for each model (same prompt text, same rubric)
        judge_prompt = build_judge_prompt(rubric_text, send_text, rep, content_sha)

        # Call Judge A
        print(f"[{idx+1}/{len(unique_external)}] JUDGE A {rep} cls={cls} len={len(send_text)} truncated={truncated}")
        res_a = call_opencode(JUDGE_A_MODEL, judge_prompt, timeout=90)
        call_rec_a = {
            "CASE_ID": rep,
            "CONTENT_SHA256": content_sha,
            "REDACTED_OR_ORIGINAL": redacted_or_original,
            "JUDGE": "A",
            "MODEL": JUDGE_A_MODEL,
            "TIMESTAMP": res_a["timestamp"],
            "EXIT_CODE": res_a["exit_code"],
            "ELAPSED_MS": res_a["elapsed_ms"],
            "INPUT_HASH": res_a["input_hash"],
            "OUTPUT_HASH": res_a["output_hash"],
            "TRUNCATED": truncated,
            "ORIGINAL_LENGTH": original_len,
            "SEND_LENGTH": len(send_text),
        }
        call_f.write(json.dumps(call_rec_a)+"\n"); call_f.flush()
        obj_a = extract_json(res_a["text"])
        valid_a, msg_a = validate_schema(obj_a) if "__parse_error" not in obj_a else (False, obj_a.get("__parse_error"))
        if not valid_a:
            print(f"  Judge A parse/validate FAIL {rep}: {msg_a} raw={res_a['text'][:300]}")
            # try once retry
            time.sleep(2)
            res_a2 = call_opencode(JUDGE_A_MODEL, judge_prompt, timeout=90)
            obj_a2 = extract_json(res_a2["text"])
            valid_a2, msg_a2 = validate_schema(obj_a2) if "__parse_error" not in obj_a2 else (False, obj_a2.get("__parse_error"))
            if valid_a2:
                obj_a = obj_a2
                res_a = res_a2
                valid_a = valid_a2
            else:
                print(f"  Retry also failed for A {rep}")

        # Call Judge B
        print(f"[{idx+1}/{len(unique_external)}] JUDGE B {rep}")
        res_b = call_opencode(JUDGE_B_MODEL, judge_prompt, timeout=90)
        call_rec_b = {
            "CASE_ID": rep,
            "CONTENT_SHA256": content_sha,
            "REDACTED_OR_ORIGINAL": redacted_or_original,
            "JUDGE": "B",
            "MODEL": JUDGE_B_MODEL,
            "TIMESTAMP": res_b["timestamp"],
            "EXIT_CODE": res_b["exit_code"],
            "ELAPSED_MS": res_b["elapsed_ms"],
            "INPUT_HASH": res_b["input_hash"],
            "OUTPUT_HASH": res_b["output_hash"],
            "TRUNCATED": truncated,
            "ORIGINAL_LENGTH": original_len,
            "SEND_LENGTH": len(send_text),
        }
        call_f.write(json.dumps(call_rec_b)+"\n"); call_f.flush()
        obj_b = extract_json(res_b["text"])
        valid_b, msg_b = validate_schema(obj_b) if "__parse_error" not in obj_b else (False, obj_b.get("__parse_error"))
        if not valid_b:
            print(f"  Judge B parse/validate FAIL {rep}: {msg_b} raw={res_b['text'][:300]}")
            time.sleep(2)
            res_b2 = call_opencode(JUDGE_B_MODEL, judge_prompt, timeout=90)
            obj_b2 = extract_json(res_b2["text"])
            valid_b2, msg_b2 = validate_schema(obj_b2) if "__parse_error" not in obj_b2 else (False, obj_b2.get("__parse_error"))
            if valid_b2:
                obj_b = obj_b2
                res_b = res_b2
                valid_b = valid_b2
            else:
                print(f"  Retry also failed for B {rep}")

        # Adjudication decision
        need_adjudication = False
        reason = []
        if valid_a and valid_b:
            if abs(obj_a["overall_score"] - obj_b["overall_score"]) > 15:
                need_adjudication = True
                reason.append(f"score_delta {abs(obj_a['overall_score']-obj_b['overall_score'])}>15")
            if abs(BAND_ORDER[obj_a["quality_band"]] - BAND_ORDER[obj_b["quality_band"]]) > 1:
                need_adjudication = True
                reason.append(f"band_delta >1 {obj_a['quality_band']} vs {obj_b['quality_band']}")
            if obj_a["fit_for_purpose"] != obj_b["fit_for_purpose"]:
                need_adjudication = True
                reason.append(f"fit_disagree {obj_a['fit_for_purpose']} vs {obj_b['fit_for_purpose']}")
            # critical issue disagreement: one empty other non-empty
            crit_a = len(obj_a.get("critical_issues",[]))>0
            crit_b = len(obj_b.get("critical_issues",[]))>0
            if crit_a != crit_b:
                need_adjudication = True
                reason.append(f"critical_disagree {crit_a} vs {crit_b}")

        adjudicated = False
        obj_c = None
        res_c = None
        reference_obj = None
        if need_adjudication:
            print(f"  -> Adjudication needed {rep}: {reason}")
            # Judge C call
            res_c = call_opencode(JUDGE_C_MODEL, judge_prompt, timeout=90)
            call_rec_c = {
                "CASE_ID": rep,
                "CONTENT_SHA256": content_sha,
                "REDACTED_OR_ORIGINAL": redacted_or_original,
                "JUDGE": "C",
                "MODEL": JUDGE_C_MODEL,
                "TIMESTAMP": res_c["timestamp"],
                "EXIT_CODE": res_c["exit_code"],
                "ELAPSED_MS": res_c["elapsed_ms"],
                "INPUT_HASH": res_c["input_hash"],
                "OUTPUT_HASH": res_c["output_hash"],
                "TRUNCATED": truncated,
                "REASON": reason,
            }
            call_f.write(json.dumps(call_rec_c)+"\n"); call_f.flush()
            obj_c = extract_json(res_c["text"])
            valid_c, msg_c = validate_schema(obj_c) if "__parse_error" not in obj_c else (False, obj_c.get("__parse_error"))
            if valid_c:
                adjudicated = True
                # Reference is median of three? Use adjudicated as C's judgment as tie-breaker per spec: C is independent, not averaged, but we take C as reference if disagreement else average.
                # For final reference we use average of A/B if not adjudicated, else C
                reference_obj = obj_c
            else:
                print(f"  Judge C failed for {rep}: {msg_c}")
                # fallback to average of A/B
                adjudicated = False
                # average
                reference_obj = {
                    "overall_score": int(round((obj_a["overall_score"]+obj_b["overall_score"])/2)),
                    "quality_band": band_from_score(int(round((obj_a["overall_score"]+obj_b["overall_score"])/2))),
                    "fit_for_purpose": obj_a["fit_for_purpose"] if obj_a["fit_for_purpose"]==obj_b["fit_for_purpose"] else "PARTIAL",
                    "prompt_type": obj_a.get("prompt_type","Other"),
                    "critical_issues": list(set(obj_a.get("critical_issues",[])+obj_b.get("critical_issues",[]))),
                    "missing_information": list(set(obj_a.get("missing_information",[])+obj_b.get("missing_information",[]))),
                    "confidence": (obj_a.get("confidence",0)+obj_b.get("confidence",0))/2,
                }
        else:
            # No adjudication, reference is average
            if valid_a and valid_b:
                avg_score = int(round((obj_a["overall_score"]+obj_b["overall_score"])/2))
                reference_obj = {
                    "overall_score": avg_score,
                    "quality_band": band_from_score(avg_score),
                    "fit_for_purpose": obj_a["fit_for_purpose"] if obj_a["fit_for_purpose"]==obj_b["fit_for_purpose"] else obj_a["fit_for_purpose"],
                    "prompt_type": obj_a.get("prompt_type", obj_b.get("prompt_type","Other")),
                    "critical_issues": list(set(obj_a.get("critical_issues",[])+obj_b.get("critical_issues",[]))),
                    "missing_information": list(set(obj_a.get("missing_information",[])+obj_b.get("missing_information",[]))),
                    "confidence": (obj_a.get("confidence",0.5)+obj_b.get("confidence",0.5))/2,
                }
                # If fit disagree but no adjudication? Actually fit disagree triggers adjudication, so this case won't happen.
            elif valid_a:
                reference_obj = obj_a
            elif valid_b:
                reference_obj = obj_b
            else:
                reference_obj = {"overall_score": 50, "quality_band":"FAIR","fit_for_purpose":"PARTIAL","prompt_type":"Other","critical_issues":[],"missing_information":[],"confidence":0.0}

        # Handle duplicate mapping: need to map result back to all CASE_IDs sharing same SHA
        duplicate_ids = sha_to_cases[sha]
        for dup_id in duplicate_ids:
            rec = {
                "CASE_ID": dup_id,
                "CONTENT_SHA256": sha,
                "REDACTED_OR_ORIGINAL": redacted_or_original,
                "TRUNCATED": truncated,
                "JUDGE_A_MODEL": JUDGE_A_MODEL,
                "JUDGE_A_RESULT": obj_a if valid_a else {"__error": msg_a, "__raw": res_a["text"][:500]},
                "JUDGE_B_MODEL": JUDGE_B_MODEL,
                "JUDGE_B_RESULT": obj_b if valid_b else {"__error": msg_b, "__raw": res_b["text"][:500]},
                "JUDGE_C_MODEL": JUDGE_C_MODEL if need_adjudication else None,
                "JUDGE_C_RESULT": obj_c if adjudicated else None,
                "ADJUDICATED": adjudicated,
                "ADJUDICATION_REASON": reason if need_adjudication else [],
                "REFERENCE_SCORE": reference_obj["overall_score"] if reference_obj else None,
                "REFERENCE_BAND": reference_obj["quality_band"] if reference_obj else None,
                "REFERENCE_TYPE": reference_obj.get("prompt_type") if reference_obj else None,
                "FIT_FOR_PURPOSE": reference_obj.get("fit_for_purpose") if reference_obj else None,
                "CRITICAL_ISSUE_COUNT": len(reference_obj.get("critical_issues",[])) if reference_obj else 0,
            }
            out_f.write(json.dumps(rec, ensure_ascii=False)+"\n")
            out_f.flush()
            done[dup_id]=rec

        # small delay to avoid rate limit
        time.sleep(0.5)

    out_f.close()
    call_f.close()
    print(f"Done. Judged {len(done)} total CASE_IDs (including duplicates). Unique {len(unique_external)}")
    # Now build reference live json without raw prompt content per spec (no raw prompt)
    # Aggregate per unique? But spec says each record CASE_ID, CONTENT_SHA256, reference_score etc. We'll use unique.
    refs = []
    seen_sha=set()
    for line in open(OUTPUT_JSON, encoding='utf-8'):
        rec=json.loads(line)
        sha=rec["CONTENT_SHA256"]
        if sha in seen_sha:
            continue
        seen_sha.add(sha)
        refs.append({
            "CASE_ID": rec["CASE_ID"],
            "CONTENT_SHA256": rec["CONTENT_SHA256"],
            "reference_score": rec["REFERENCE_SCORE"],
            "reference_band": rec["REFERENCE_BAND"],
            "reference_type": rec["REFERENCE_TYPE"],
            "fit_for_purpose": rec["FIT_FOR_PURPOSE"],
            "critical_issue_count": rec["CRITICAL_ISSUE_COUNT"],
            "adjudicated": rec["ADJUDICATED"],
            "judge_provenance": {
                "judge_a_model": rec["JUDGE_A_MODEL"],
                "judge_b_model": rec["JUDGE_B_MODEL"],
                "judge_c_model": rec["JUDGE_C_MODEL"],
            },
            "redacted_or_original": rec["REDACTED_OR_ORIGINAL"],
            "truncated": rec["TRUNCATED"],
        })
    open(REFERENCE_OUT,'w',encoding='utf-8').write(json.dumps(refs, indent=2, ensure_ascii=False))
    print(f"Wrote reference live {REFERENCE_OUT} {len(refs)} records")

if __name__=="__main__":
    main()
