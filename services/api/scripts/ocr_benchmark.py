"""Rescue Meal OCR·추출 정확도 벤치마크.

사용 예 (services/api 에서):

    # 실제 사진 corpus: 실행 중인 OCR worker + 현재 parser
    uv run python scripts/ocr_benchmark.py --worker-url http://127.0.0.1:8002

    # 사진 없이 parser 단계만 (저장소 sanitized fixture 텍스트)
    uv run python scripts/ocr_benchmark.py --text-only

동작:
- ``<corpus>/{receipts,labels}/<id>.<jpg|jpeg|png|webp>`` 를 API intake와 같은 순서
  (품질 gate → EXIF 회전 → OCR 입력 보정 → OCR worker → parser)로 처리한다.
  API 서버를 띄우지 않고 ``app.pipeline`` 모듈을 직접 호출하므로 포트를 쓰지 않는다.
- ``<id>.truth.json`` 이 있으면 채점하고, 없으면 현재 결과로 ``<id>.truth.draft.json`` 을 만든다.
- ``--text-only`` 는 OCR을 건너뛰고 ``<id>.txt`` 를 parser에 바로 넣는다.
  corpus를 지정하지 않으면 ``data/fixtures/{receipts,labels}`` 텍스트와
  ``data/fixtures/ocr-truth`` 정답을 쓴다.
- 리포트(Markdown/JSON)에는 지표와 id만 담는다. 상품명 등 원문 대조표는
  ``--details-dir`` (기본: ``data/ocr-corpus/_results/``, gitignore 대상)에만 쓴다.

이 스크립트는 parser·worker 동작을 바꾸지 않는다. 측정만 한다.
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import statistics
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
sys.path.insert(0, str(API_ROOT))

from app.pipeline.image_quality import (  # noqa: E402
    assess_image_quality,
    normalize_image_orientation,
    prepare_ocr_image,
)
from app.pipeline.label_parser import ParsedLabel, parse_label_text  # noqa: E402
from app.pipeline.ocr import OcrRun, RemoteOcrEngine  # noqa: E402
from app.pipeline.receipt_parser import ParsedReceipt, parse_receipt_observations, parse_receipt_text  # noqa: E402

IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp")
CONSUMPTION_KINDS = {"use_by", "sell_by", "best_before"}
DATE_KINDS = {"use_by", "sell_by", "best_before", "production_date", "packaging_date", "unknown"}
STORAGE_VALUES = {"refrigerated", "frozen", "ambient", "unknown"}
RECEIPT_SCHEMA = "rescue-meal.ocr-truth.receipt.v1"
LABEL_SCHEMA = "rescue-meal.ocr-truth.label.v1"
DRAFT_NOTE = (
    "현재 파이프라인 결과로 만든 초안입니다. 사진과 비교해 틀린 값을 고치고, 빠진 상품/날짜를 추가하고, "
    "할인·합계 행은 지우세요. 다 고치면 파일 이름을 <id>.truth.json 으로 바꾸세요. 이 _draft 키는 지워도 되고 남겨도 됩니다."
)


# --------------------------------------------------------------------------- normalisation


_NAME_PUNCT_RE = re.compile(r"[\s()\[\]{}<>/\\|·.,:;'\"`~!@#$%^&*_+=?\-]+")


def normalize_name(name: str | None) -> str:
    """상품명 비교용 정규화.

    NFKC → 소문자 → 맨 앞 품번(001 등) 제거 → 공백·괄호·구두점 제거.
    용량·수량 표기(500ml, 5입)는 남긴다(다른 상품을 구분하는 정보이기 때문).
    """

    if not name:
        return ""
    text = unicodedata.normalize("NFKC", name).lower()
    text = re.sub(r"^\s*\d{3}(?=\s|[가-힣a-z]|$)", "", text)
    return _NAME_PUNCT_RE.sub("", text)


_SIZE_TOKEN_RE = re.compile(r"\d+(?:\.\d+)?(?:kg|g|ml|l|개|팩|입|구|병|캔|박스|봉|단|모|통|줄|\))")


def core_name(name: str | None) -> str:
    """용량·입수 표기를 뺀 핵심 상품명. OCR observation 경로는 이 표기를
    상품명에서 떼어 내므로(수량 칸으로 보냄) 같은 상품을 놓치지 않도록 보조로 쓴다."""

    return _SIZE_TOKEN_RE.sub("", normalize_name(name))


def name_similarity(left: str | None, right: str | None) -> float:
    a, b = normalize_name(left), normalize_name(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    full = SequenceMatcher(None, a, b).ratio()
    core_a, core_b = core_name(left), core_name(right)
    if len(core_a) >= 2 and len(core_b) >= 2:
        # 핵심명만 같은 경우는 완전일치(1.0)로 치지 않는다.
        core = 0.99 if core_a == core_b else SequenceMatcher(None, core_a, core_b).ratio()
        return max(full, core)
    return full


def normalize_merchant(name: str | None) -> str:
    if not name:
        return ""
    text = unicodedata.normalize("NFKC", name)
    text = re.sub(r"^\s*(?:\(주\)|주식회사|㈜)\s*", "", text)
    return re.sub(r"\s+", "", text).lower()


def parse_iso_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def as_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


# --------------------------------------------------------------------------- pipeline


@dataclass
class PipelineResult:
    status: str  # complete | quality_reject | ocr_unavailable | ocr_failed
    message: str | None
    parsed: ParsedReceipt | ParsedLabel | None
    observations: int
    timing_ms: dict[str, float]
    quality_status: str | None = None
    ocr_input_profile: str | None = None


def run_image(path: Path, doc_type: str, engine: RemoteOcrEngine) -> PipelineResult:
    """API intake(`/api/receipts/intake`, `/api/labels/intake`)와 같은 단계."""

    data = path.read_bytes()
    started = time.perf_counter()
    quality_report = assess_image_quality(data)
    if quality_report.status == "reject":
        total = (time.perf_counter() - started) * 1000
        return PipelineResult("quality_reject", "; ".join(quality_report.warnings), None, 0, {"total": total}, "reject")
    prepared = prepare_ocr_image(normalize_image_orientation(data), quality_report)
    pre_done = time.perf_counter()
    run: OcrRun = engine.extract(prepared.image_bytes, path.name)
    ocr_done = time.perf_counter()
    timing = {"preprocess": (pre_done - started) * 1000, "ocr": (ocr_done - pre_done) * 1000}
    if run.status != "complete":
        timing["total"] = (ocr_done - started) * 1000
        status = "ocr_unavailable" if run.status == "unavailable" else "ocr_failed"
        return PipelineResult(status, run.message, None, 0, timing, quality_report.status, prepared.profile)
    if doc_type == "receipt":
        parsed: ParsedReceipt | ParsedLabel = parse_receipt_observations(run.observations)
    else:
        parsed = parse_label_text("\n".join(item.text for item in run.observations))
    done = time.perf_counter()
    timing["parse"] = (done - ocr_done) * 1000
    timing["total"] = (done - started) * 1000
    return PipelineResult("complete", None, parsed, len(run.observations), timing, quality_report.status, prepared.profile)


def run_text(path: Path, doc_type: str) -> PipelineResult:
    text = path.read_text(encoding="utf-8")
    started = time.perf_counter()
    parsed: ParsedReceipt | ParsedLabel = parse_receipt_text(text) if doc_type == "receipt" else parse_label_text(text)
    elapsed = (time.perf_counter() - started) * 1000
    lines = len([line for line in text.splitlines() if line.strip()])
    return PipelineResult("complete", None, parsed, lines, {"parse": elapsed, "total": elapsed})


# --------------------------------------------------------------------------- drafts


def receipt_draft(parsed: ParsedReceipt | None) -> dict[str, Any]:
    lines = []
    if parsed is not None:
        for line in parsed.lines:
            if line.line_type != "product":
                continue
            lines.append(
                {
                    "name": line.raw_name,
                    "quantity": line.quantity,
                    "total_price": line.total_price,
                    "unit_price": line.unit_price,
                }
            )
    return {
        "_draft": DRAFT_NOTE,
        "schema": RECEIPT_SCHEMA,
        "merchant_name": parsed.merchant_name if parsed else None,
        "purchased_at": parsed.purchased_at.date().isoformat() if parsed and parsed.purchased_at else None,
        "grocery": (parsed.kind != "restaurant_receipt") if parsed else True,
        "lines": lines,
        "notes": "",
    }


def label_draft(parsed: ParsedLabel | None) -> dict[str, Any]:
    dates = []
    if parsed is not None:
        dates = [{"kind": candidate.kind, "value": candidate.value.isoformat()} for candidate in parsed.date_candidates]
    return {
        "_draft": DRAFT_NOTE,
        "schema": LABEL_SCHEMA,
        "dates": dates,
        "storage": parsed.storage_hint if parsed else "unknown",
        "notes": "",
    }


# --------------------------------------------------------------------------- truth validation


def validate_truth(truth: dict[str, Any], doc_type: str) -> list[str]:
    problems: list[str] = []
    expected = RECEIPT_SCHEMA if doc_type == "receipt" else LABEL_SCHEMA
    if truth.get("schema") != expected:
        problems.append(f"schema must be {expected}")
    try:
        if doc_type == "receipt":
            parse_iso_date(truth.get("purchased_at"))
            for line in truth.get("lines", []):
                if not line.get("name"):
                    problems.append("line without name")
                as_number(line.get("quantity"))
                as_number(line.get("total_price"))
        else:
            for item in truth.get("dates", []):
                if item.get("kind") not in DATE_KINDS:
                    problems.append(f"unknown date kind {item.get('kind')!r}")
                parse_iso_date(item.get("value"))
            if truth.get("storage", "unknown") not in STORAGE_VALUES:
                problems.append(f"unknown storage {truth.get('storage')!r}")
    except (TypeError, ValueError) as exc:
        problems.append(f"invalid value: {exc}")
    return problems


# --------------------------------------------------------------------------- scoring


def match_lines(predicted: list[Any], truth_lines: list[dict[str, Any]], threshold: float) -> list[tuple[int, int, float]]:
    """1:1 greedy matching by descending name similarity (>= threshold)."""

    pairs = []
    for p_index, line in enumerate(predicted):
        for t_index, truth_line in enumerate(truth_lines):
            score = name_similarity(line.raw_name, truth_line.get("name"))
            if score >= threshold:
                pairs.append((score, p_index, t_index))
    pairs.sort(key=lambda item: (-item[0], item[1], item[2]))
    used_p: set[int] = set()
    used_t: set[int] = set()
    matched = []
    for score, p_index, t_index in pairs:
        if p_index in used_p or t_index in used_t:
            continue
        used_p.add(p_index)
        used_t.add(t_index)
        matched.append((p_index, t_index, score))
    return matched


def score_receipt(result: PipelineResult, truth: dict[str, Any], threshold: float) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (privacy-safe metrics, private detail rows)."""

    parsed: ParsedReceipt | None = result.parsed  # type: ignore[assignment]
    truth_grocery = bool(truth.get("grocery", True))
    # 식당 영수증 등 비식료품은 재고 입고 대상이 아니므로 라인 지표에서 제외하고
    # 식료품/식당 구분만 채점한다.
    truth_lines = truth.get("lines", []) if truth_grocery else []
    predicted = [line for line in parsed.lines if line.line_type == "product"] if parsed and truth_grocery else []
    matches = match_lines(predicted, truth_lines, threshold)

    truth_merchant = normalize_merchant(truth.get("merchant_name"))
    pred_merchant = normalize_merchant(parsed.merchant_name if parsed else None)
    truth_date = parse_iso_date(truth.get("purchased_at"))
    pred_date = parsed.purchased_at.date() if parsed and parsed.purchased_at else None
    pred_grocery = (parsed.kind != "restaurant_receipt") if parsed else None

    qty_ok = qty_total = amount_ok = amount_total = 0
    exact_names = 0
    silent_wrong = 0
    flagged_correct = 0
    detail_rows = []
    matched_pred = {p for p, _, _ in matches}
    matched_truth = {t for _, t, _ in matches}
    for p_index, t_index, score in matches:
        line = predicted[p_index]
        truth_line = truth_lines[t_index]
        if score == 1.0:
            exact_names += 1
        t_qty = as_number(truth_line.get("quantity"))
        t_amount = as_number(truth_line.get("total_price"))
        q_match = a_match = None
        if t_qty is not None:
            qty_total += 1
            q_match = abs(float(line.quantity) - t_qty) < 1e-6
            qty_ok += int(q_match)
        if t_amount is not None:
            amount_total += 1
            a_match = line.total_price is not None and abs(float(line.total_price) - t_amount) < 0.5
            amount_ok += int(a_match)
        wrong = q_match is False or a_match is False
        flagged = line.review_reason is not None
        if wrong and not flagged:
            silent_wrong += 1
        if not wrong and flagged:
            flagged_correct += 1
        detail_rows.append(
            {
                "truth": truth_line.get("name"),
                "predicted": line.raw_name,
                "similarity": round(score, 3),
                "quantity": [t_qty, line.quantity],
                "total_price": [t_amount, line.total_price],
                "review_reason": line.review_reason,
            }
        )
    unmatched_predicted = [p for p in range(len(predicted)) if p not in matched_pred]
    silent_extra = sum(1 for p in unmatched_predicted if predicted[p].review_reason is None)
    for p in unmatched_predicted:
        detail_rows.append({"truth": None, "predicted": predicted[p].raw_name, "review_reason": predicted[p].review_reason})
    for t in range(len(truth_lines)):
        if t not in matched_truth:
            detail_rows.append({"truth": truth_lines[t].get("name"), "predicted": None})

    review_lines = sum(1 for line in predicted if line.review_reason is not None)
    metrics = {
        "merchant": _field_outcome(truth_merchant or None, pred_merchant or None),
        "purchased_at": _field_outcome(truth_date, pred_date),
        "grocery_kind_correct": None if pred_grocery is None else pred_grocery == truth_grocery,
        "truth_lines": len(truth_lines),
        "predicted_lines": len(predicted),
        "matched_lines": len(matches),
        "exact_name_matches": exact_names,
        "quantity_correct": qty_ok,
        "quantity_compared": qty_total,
        "amount_correct": amount_ok,
        "amount_compared": amount_total,
        "review_lines": review_lines,
        "grocery": truth_grocery,
        "receipt_needs_review": result.status != "complete" or review_lines > 0 or bool(parsed and parsed.warnings),
        "silent_wrong_matched_lines": silent_wrong,
        "silent_extra_lines": silent_extra,
        "flagged_but_correct_lines": flagged_correct,
        "template_id": parsed.template_id if parsed else None,
    }
    details = {
        "merchant": [truth.get("merchant_name"), parsed.merchant_name if parsed else None],
        "purchased_at": [str(truth_date) if truth_date else None, str(pred_date) if pred_date else None],
        "warnings": parsed.warnings if parsed else [],
        "lines": detail_rows,
    }
    return metrics, details


def _field_outcome(truth_value: Any, predicted_value: Any) -> str:
    """correct | wrong | missed | spurious | both_absent."""

    if truth_value is None and predicted_value is None:
        return "both_absent"
    if truth_value is None:
        return "spurious"
    if predicted_value is None:
        return "missed"
    return "correct" if truth_value == predicted_value else "wrong"


def score_label(result: PipelineResult, truth: dict[str, Any], confident_threshold: float) -> tuple[dict[str, Any], dict[str, Any]]:
    parsed: ParsedLabel | None = result.parsed  # type: ignore[assignment]
    truth_dates = [(item["kind"], parse_iso_date(item["value"])) for item in truth.get("dates", [])]
    candidates = list(parsed.date_candidates) if parsed else []
    truth_values = {value for _, value in truth_dates}

    # 날짜 값 recall: 정답 날짜 각각이 후보 중에 있는가
    values_found = sum(1 for _, value in truth_dates if any(c.value == value for c in candidates))
    # 날짜 값 precision: 후보 중 정답에 있는 날짜 값
    candidates_correct = sum(1 for c in candidates if c.value in truth_values)

    kind_correct = kind_abstained = kind_wrong = 0
    kind_rows = []
    used: set[int] = set()
    for truth_kind, value in truth_dates:
        hit = next((i for i, c in enumerate(candidates) if c.value == value and i not in used), None)
        if hit is None:
            continue
        used.add(hit)
        predicted_kind = candidates[hit].kind
        if predicted_kind == truth_kind:
            kind_correct += 1
            outcome = "correct"
        elif predicted_kind == "unknown":
            kind_abstained += 1
            outcome = "abstained"
        else:
            kind_wrong += 1
            outcome = "wrong"
        kind_rows.append({"value": value.isoformat(), "truth_kind": truth_kind, "predicted_kind": predicted_kind, "outcome": outcome})

    truth_consumption = {value for kind, value in truth_dates if kind in CONSUMPTION_KINDS}
    selected = parsed.consumption_date_candidate if parsed else None
    if selected is None:
        consumption_outcome = "missed" if truth_consumption else "both_absent"
    elif selected.value in truth_consumption:
        consumption_outcome = "correct"
    else:
        consumption_outcome = "wrong"
    confident_wrong = consumption_outcome == "wrong" and selected is not None and selected.confidence >= confident_threshold

    pred_storage = parsed.storage_hint if parsed else None
    metrics = {
        "truth_dates": len(truth_dates),
        "predicted_dates": len(candidates),
        "truth_dates_found": values_found,
        "predicted_dates_correct": candidates_correct,
        "kind_correct": kind_correct,
        "kind_abstained": kind_abstained,
        "kind_wrong": kind_wrong,
        "consumption_date": consumption_outcome,
        "consumption_selected_confidence": round(selected.confidence, 3) if selected else None,
        "confident_wrong_consumption_date": confident_wrong,
        "storage_correct": None if pred_storage is None else pred_storage == truth.get("storage", "unknown"),
        "label_requires_review": True if parsed is None else parsed.requires_review,
    }
    details = {
        "kinds": kind_rows,
        "candidates": [
            {"kind": c.kind, "value": c.value.isoformat(), "confidence": c.confidence, "raw": c.raw_text} for c in candidates
        ],
        "selected_consumption": selected.value.isoformat() if selected else None,
        "storage": [truth.get("storage"), pred_storage],
        "warnings": parsed.warnings if parsed else [],
    }
    return metrics, details


# --------------------------------------------------------------------------- aggregation


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _timing_summary(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"count": 0, "p50_ms": None, "p90_ms": None, "max_ms": None, "mean_ms": None}
    ordered = sorted(values)
    p90_index = max(0, min(len(ordered) - 1, round(0.9 * (len(ordered) - 1))))
    return {
        "count": len(ordered),
        "p50_ms": round(statistics.median(ordered), 2),
        "p90_ms": round(ordered[p90_index], 2),
        "max_ms": round(ordered[-1], 2),
        "mean_ms": round(statistics.fmean(ordered), 2),
    }


def _outcome_counts(items: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        counts[item[key]] = counts.get(item[key], 0) + 1
    return counts


def _field_accuracy(counts: dict[str, int]) -> float | None:
    # 정답에 값이 있는 문서 기준. spurious(정답 없음인데 추출)는 따로 보고한다.
    with_truth = counts.get("correct", 0) + counts.get("wrong", 0) + counts.get("missed", 0)
    return _ratio(counts.get("correct", 0), with_truth)


def aggregate_receipts(items: list[dict[str, Any]]) -> dict[str, Any]:
    metrics = [item["metrics"] for item in items]
    total = lambda key: sum(m[key] for m in metrics)  # noqa: E731
    merchant = _outcome_counts(metrics, "merchant")
    purchased = _outcome_counts(metrics, "purchased_at")
    grocery_known = [m["grocery_kind_correct"] for m in metrics if m["grocery_kind_correct"] is not None]
    return {
        "documents": len(items),
        "pipeline_status": _outcome_counts(items, "status"),
        "merchant_accuracy": _field_accuracy(merchant),
        "merchant_outcomes": merchant,
        "purchased_at_accuracy": _field_accuracy(purchased),
        "purchased_at_outcomes": purchased,
        "grocery_kind_accuracy": _ratio(sum(grocery_known), len(grocery_known)),
        "line_precision": _ratio(total("matched_lines"), total("predicted_lines")),
        "line_recall": _ratio(total("matched_lines"), total("truth_lines")),
        "line_counts": {k: total(k) for k in ("truth_lines", "predicted_lines", "matched_lines", "exact_name_matches")},
        "quantity_match_rate": _ratio(total("quantity_correct"), total("quantity_compared")),
        "amount_match_rate": _ratio(total("amount_correct"), total("amount_compared")),
        "review_line_rate": _ratio(total("review_lines"), total("predicted_lines")),
        "receipt_review_rate": _ratio(
            sum(1 for m in metrics if m["grocery"] and m["receipt_needs_review"]), sum(1 for m in metrics if m["grocery"])
        ),
        "silent_wrong_matched_lines": total("silent_wrong_matched_lines"),
        "silent_extra_lines": total("silent_extra_lines"),
        "flagged_but_correct_lines": total("flagged_but_correct_lines"),
        "timing": _timing_summary([item["timing_ms"]["total"] for item in items]),
        "ocr_timing": _timing_summary([item["timing_ms"]["ocr"] for item in items if "ocr" in item["timing_ms"]]),
    }


def aggregate_labels(items: list[dict[str, Any]]) -> dict[str, Any]:
    metrics = [item["metrics"] for item in items]
    total = lambda key: sum(m[key] for m in metrics)  # noqa: E731
    matched_kinds = total("kind_correct") + total("kind_abstained") + total("kind_wrong")
    consumption = _outcome_counts(metrics, "consumption_date")
    storage_known = [m["storage_correct"] for m in metrics if m["storage_correct"] is not None]
    return {
        "documents": len(items),
        "pipeline_status": _outcome_counts(items, "status"),
        "date_value_recall": _ratio(total("truth_dates_found"), total("truth_dates")),
        "date_value_precision": _ratio(total("predicted_dates_correct"), total("predicted_dates")),
        "date_counts": {k: total(k) for k in ("truth_dates", "predicted_dates", "truth_dates_found", "predicted_dates_correct")},
        "kind_correct_rate": _ratio(total("kind_correct"), matched_kinds),
        "kind_misclassification_rate": _ratio(total("kind_wrong"), matched_kinds),
        "kind_abstain_rate": _ratio(total("kind_abstained"), matched_kinds),
        "consumption_date_outcomes": consumption,
        "consumption_date_wrong": consumption.get("wrong", 0),
        "confident_wrong_consumption_date": sum(1 for m in metrics if m["confident_wrong_consumption_date"]),
        "confident_wrong_ids": [item["id"] for item in items if item["metrics"]["confident_wrong_consumption_date"]],
        "storage_accuracy": _ratio(sum(storage_known), len(storage_known)),
        "label_review_rate": _ratio(sum(1 for m in metrics if m["label_requires_review"]), len(metrics)),
        "timing": _timing_summary([item["timing_ms"]["total"] for item in items]),
        "ocr_timing": _timing_summary([item["timing_ms"]["ocr"] for item in items if "ocr" in item["timing_ms"]]),
    }


# --------------------------------------------------------------------------- report


def _timing_text(summary: dict[str, Any]) -> str:
    timing = summary["timing"]
    text = f"p50 {timing['p50_ms']} ms / p90 {timing['p90_ms']} ms / max {timing['max_ms']} ms"
    if summary["ocr_timing"]["count"]:
        text += f" (OCR worker 왕복 p50 {summary['ocr_timing']['p50_ms']} ms)"
    return text


def render_markdown(report: dict[str, Any], observations: list[str]) -> str:
    cfg = report["config"]
    lines = [
        f"# OCR 추출 벤치마크 — {report['generated_at'][:10]} ({cfg['mode']})",
        "",
        "> 자동 생성: `services/api/scripts/ocr_benchmark.py`. 이 문서에는 지표와 문서 id만 있습니다.",
        "> 원본 이미지·OCR 원문·상품명은 포함하지 않습니다.",
        "",
        "## 실행 조건",
        "",
        f"- mode: `{cfg['mode']}`" + (" (OCR 생략, 텍스트를 parser에 직접 입력)" if cfg["mode"] == "text-only" else ""),
        f"- corpus: `{cfg['corpus_label']}`",
        f"- OCR worker: `{cfg['worker_url'] or '-'}`" + (f" / model `{cfg['ocr_model_version']}`" if cfg.get("ocr_model_version") else ""),
        f"- 상품명 매칭: NFKC·소문자·앞 품번/공백/괄호·구두점 제거 후 `difflib.SequenceMatcher` 비율(전체명과 용량·입수 표기를 뺀 핵심명 중 큰 값) ≥ {cfg['name_threshold']} 인 1:1 greedy 매칭. '이름 완전일치'는 정규화한 전체명이 같은 경우만",
        f"- '확신한 틀린 소비기한' 기준: 앱이 고르는 소비기한 후보의 confidence ≥ {cfg['confident_threshold']}",
        f"- Python {cfg['python']} / {cfg['platform']}",
        f"- 채점 {report['scored_documents']}건, 정답 초안 생성 {len(report['drafts_written'])}건, 건너뜀 {len(report['skipped'])}건",
        "",
    ]
    receipts = report["receipts"]["summary"]
    if receipts["documents"]:
        lines += [
            "## 영수증",
            "",
            "| 지표 | 값 | 비고 |",
            "|---|---|---|",
            f"| 문서 수 | {receipts['documents']} | pipeline 상태 {receipts['pipeline_status']} |",
            f"| 매장명 정확도 | {_pct(receipts['merchant_accuracy'])} | {receipts['merchant_outcomes']} |",
            f"| 구매일 정확도 | {_pct(receipts['purchased_at_accuracy'])} | {receipts['purchased_at_outcomes']} |",
            f"| 식료품/식당 구분 | {_pct(receipts['grocery_kind_accuracy'])} | 식당 영수증은 입고 제외가 정답 |",
            f"| 라인 precision | {_pct(receipts['line_precision'])} | 매칭 {receipts['line_counts']['matched_lines']} / 추출 {receipts['line_counts']['predicted_lines']} |",
            f"| 라인 recall | {_pct(receipts['line_recall'])} | 매칭 {receipts['line_counts']['matched_lines']} / 정답 {receipts['line_counts']['truth_lines']} (이름 완전일치 {receipts['line_counts']['exact_name_matches']}) |",
            f"| 수량 일치율 | {_pct(receipts['quantity_match_rate'])} | 매칭된 라인 기준 |",
            f"| 금액 일치율 | {_pct(receipts['amount_match_rate'])} | 매칭된 라인의 행 합계 금액 |",
            f"| 검토 필요 라인 비율 | {_pct(receipts['review_line_rate'])} | parser가 review_reason을 단 상품 라인 / 추출 라인 |",
            f"| 검토 필요 영수증 비율 | {_pct(receipts['receipt_review_rate'])} | 식료품 영수증 중 검토 라인·경고·OCR 실패가 하나라도 있는 비율 |",
            f"| 검토 표시 없이 틀린 라인 | {receipts['silent_wrong_matched_lines']} | 수량/금액이 틀렸는데 review_reason 없음 |",
            f"| 검토 표시 없는 가짜 라인 | {receipts['silent_extra_lines']} | 정답에 없는데 review_reason 없이 추출 |",
            f"| 맞았는데 검토로 넘긴 라인 | {receipts['flagged_but_correct_lines']} | 사용자 수고만 늘린 경우 |",
            f"| 장당 처리 시간 | {_timing_text(receipts)} | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |",
            "",
            "### 영수증별",
            "",
            "| id | 상태 | 매장 | 구매일 | 정답/추출/매칭 | 수량 | 금액 | 검토 라인 | 처리 ms |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
        for item in report["receipts"]["documents"]:
            m = item["metrics"]
            lines.append(
                f"| `{item['id']}` | {item['status']}{'' if m['grocery'] else ' (비식료품)'} | {m['merchant']} | {m['purchased_at']} | "
                f"{m['truth_lines']}/{m['predicted_lines']}/{m['matched_lines']} | {m['quantity_correct']}/{m['quantity_compared']} | "
                f"{m['amount_correct']}/{m['amount_compared']} | {m['review_lines']} | {item['timing_ms']['total']:.1f} |"
            )
        lines.append("")
    labels = report["labels"]["summary"]
    if labels["documents"]:
        lines += [
            "## 라벨",
            "",
            "| 지표 | 값 | 비고 |",
            "|---|---|---|",
            f"| 문서 수 | {labels['documents']} | pipeline 상태 {labels['pipeline_status']} |",
            f"| **확신한 틀린 소비기한** | **{labels['confident_wrong_consumption_date']}** | 안전상 가장 위험한 오류. id: {', '.join(f'`{i}`' for i in labels['confident_wrong_ids']) or '없음'} |",
            f"| 소비기한 선택 결과 | {labels['consumption_date_outcomes']} | correct / wrong / missed / both_absent(정답·추출 모두 없음) |",
            f"| 날짜 값 recall | {_pct(labels['date_value_recall'])} | 찾은 정답 날짜 {labels['date_counts']['truth_dates_found']} / 정답 날짜 {labels['date_counts']['truth_dates']} |",
            f"| 날짜 값 precision | {_pct(labels['date_value_precision'])} | 맞은 후보 {labels['date_counts']['predicted_dates_correct']} / 후보 {labels['date_counts']['predicted_dates']} |",
            f"| 날짜 종류 정분류율 | {_pct(labels['kind_correct_rate'])} | 값이 맞은 날짜 기준 |",
            f"| 날짜 종류 오분류율 | {_pct(labels['kind_misclassification_rate'])} | 다른 구체적 종류로 판단 (예: 제조일→소비기한) |",
            f"| 날짜 종류 보류율 | {_pct(labels['kind_abstain_rate'])} | unknown으로 남겨 사용자에게 넘김 (안전한 실패) |",
            f"| 보관조건 정확도 | {_pct(labels['storage_accuracy'])} | 냉장/냉동/실온/unknown |",
            f"| 검토 필요 라벨 비율 | {_pct(labels['label_review_rate'])} | parser requires_review |",
            f"| 장당 처리 시간 | {_timing_text(labels)} | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |",
            "",
            "### 라벨별",
            "",
            "| id | 상태 | 정답/후보/찾음 | 종류 정/보류/오 | 소비기한 | 확신 오류 | 보관 | 처리 ms |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for item in report["labels"]["documents"]:
            m = item["metrics"]
            lines.append(
                f"| `{item['id']}` | {item['status']} | {m['truth_dates']}/{m['predicted_dates']}/{m['truth_dates_found']} | "
                f"{m['kind_correct']}/{m['kind_abstained']}/{m['kind_wrong']} | {m['consumption_date']} | "
                f"{'**예**' if m['confident_wrong_consumption_date'] else '아니오'} | {m['storage_correct']} | {item['timing_ms']['total']:.1f} |"
            )
        lines.append("")
    if report["skipped"]:
        lines += ["## 건너뛴 파일", ""]
        lines += [f"- `{item['id']}`: {item['reason']}" for item in report["skipped"]]
        lines.append("")
    if observations:
        lines += ["## 관찰된 약점", ""]
        lines += [f"- {text}" for text in observations]
        lines.append("")
    lines += [
        "## 지표 해석",
        "",
        "- 매장·구매일 정확도의 분모는 정답 파일에 값이 있는 문서입니다. `spurious`는 정답이 null인데 값을 만든 경우입니다.",
        "- 라인 precision이 낮으면 할인·합계·바코드 행이 상품으로 들어오고, recall이 낮으면 상품을 놓친 것입니다.",
        "- '검토 표시 없이 틀린 라인'은 사용자가 그대로 저장할 위험이 있는 오류이므로 0이 목표입니다.",
        "- 라벨의 '확신한 틀린 소비기한'은 앱이 고르는 소비기한 후보가 정답 소비기한과 다르면서 confidence가 기준 이상인 경우입니다. 0이 아니면 해당 id를 먼저 보세요.",
        "- 이 표본은 소수 문서 기준이므로 비율보다 개별 실패 id를 우선 확인하세요.",
        "",
    ]
    return "\n".join(lines)


def auto_observations(report: dict[str, Any]) -> list[str]:
    """지표에서 바로 읽히는 약점만 개인정보 없이 문장으로 만든다."""

    notes: list[str] = []
    r = report["receipts"]["summary"]
    if r["documents"]:
        for item in report["receipts"]["documents"]:
            m = item["metrics"]
            if m["merchant"] in {"missed", "wrong"}:
                notes.append(f"`{item['id']}`: 매장명 {m['merchant']}.")
            if m["purchased_at"] in {"missed", "wrong", "spurious"}:
                notes.append(f"`{item['id']}`: 구매일 {m['purchased_at']}.")
            if m["grocery_kind_correct"] is False:
                notes.append(f"`{item['id']}`: 식료품/식당 구분이 틀림.")
            if m["matched_lines"] < m["truth_lines"]:
                notes.append(f"`{item['id']}`: 상품 라인 {m['truth_lines'] - m['matched_lines']}개를 찾지 못함.")
            if m["predicted_lines"] > m["matched_lines"]:
                notes.append(f"`{item['id']}`: 정답에 없는 상품 라인 {m['predicted_lines'] - m['matched_lines']}개 추출.")
            if m["quantity_correct"] < m["quantity_compared"] or m["amount_correct"] < m["amount_compared"]:
                notes.append(
                    f"`{item['id']}`: 수량 {m['quantity_compared'] - m['quantity_correct']}건 / 금액 {m['amount_compared'] - m['amount_correct']}건 불일치"
                    f" (검토 표시 없이 틀린 라인 {m['silent_wrong_matched_lines']})."
                )
            if m["flagged_but_correct_lines"]:
                notes.append(f"`{item['id']}`: 값이 맞는 라인 {m['flagged_but_correct_lines']}개를 검토로 넘김.")
    label_summary = report["labels"]["summary"]
    if label_summary["documents"]:
        for item in report["labels"]["documents"]:
            m = item["metrics"]
            if m["confident_wrong_consumption_date"]:
                notes.append(f"`{item['id']}`: **틀린 날짜를 소비기한으로 확신함**.")
            elif m["consumption_date"] in {"wrong", "missed"}:
                notes.append(f"`{item['id']}`: 소비기한 {m['consumption_date']}.")
            if m["truth_dates_found"] < m["truth_dates"]:
                notes.append(f"`{item['id']}`: 정답 날짜 {m['truth_dates'] - m['truth_dates_found']}개를 찾지 못함.")
            if m["kind_wrong"]:
                notes.append(f"`{item['id']}`: 날짜 종류 오분류 {m['kind_wrong']}건.")
            if m["storage_correct"] is False:
                notes.append(f"`{item['id']}`: 보관조건 불일치.")
    return notes


# --------------------------------------------------------------------------- main


@dataclass
class CorpusEntry:
    doc_id: str
    doc_type: str
    source: Path
    truth_path: Path
    draft_path: Path


@dataclass
class Corpus:
    entries: list[CorpusEntry] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)


def discover(corpus_dir: Path, text_only: bool, truth_dir: Path | None) -> Corpus:
    corpus = Corpus()
    for folder, doc_type in (("receipts", "receipt"), ("labels", "label")):
        directory = corpus_dir / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.iterdir()):
            if path.name.startswith(".") or ".truth" in path.name:
                continue
            suffix = path.suffix.lower()
            doc_id = f"{folder}/{path.stem}"
            if text_only:
                if suffix != ".txt":
                    continue
            elif suffix not in IMAGE_SUFFIXES:
                if suffix in {".heic", ".heif", ".pdf"}:
                    corpus.skipped.append({"id": doc_id, "reason": f"{suffix} 미지원 — JPG/PNG로 변환해 넣으세요"})
                continue
            base = (truth_dir / folder) if truth_dir else directory
            corpus.entries.append(
                CorpusEntry(
                    doc_id,
                    doc_type,
                    path,
                    base / f"{path.stem}.truth.json",
                    base / f"{path.stem}.truth.draft.json",
                )
            )
    return corpus


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", type=Path, help="corpus 폴더 (기본: data/ocr-corpus, --text-only면 data/fixtures)")
    parser.add_argument("--truth-dir", type=Path, help="정답 파일 폴더 (기본: 사진/텍스트 옆, fixture면 data/fixtures/ocr-truth)")
    parser.add_argument("--text-only", action="store_true", help="OCR 없이 <id>.txt를 parser에 넣어 parser 단계만 측정")
    parser.add_argument("--worker-url", default="http://127.0.0.1:8002", help="실행 중인 OCR worker URL")
    parser.add_argument("--name-threshold", type=float, default=0.8, help="상품명 퍼지 매칭 최소 유사도")
    parser.add_argument("--confident-threshold", type=float, default=0.8, help="'확신' 판정 confidence 하한")
    parser.add_argument("--out", type=Path, help="리포트 경로 접두어 (기본: evidence/ocr-benchmark-<날짜>-<mode>)")
    parser.add_argument("--details-dir", type=Path, help="상품명 대조 등 개인정보 포함 상세 결과 폴더 (기본: data/ocr-corpus/_results)")
    parser.add_argument("--no-drafts", action="store_true", help="정답 없는 파일에 초안을 만들지 않음")
    parser.add_argument("--overwrite-drafts", action="store_true", help="기존 *.truth.draft.json 을 덮어씀")
    parser.add_argument("--observation", action="append", default=[], help="리포트 '관찰된 약점'에 추가할 문장 (반복 가능)")
    args = parser.parse_args(argv)

    fixture_mode = args.text_only and args.corpus is None
    corpus_dir = args.corpus or (REPO_ROOT / "data" / ("fixtures" if args.text_only else "ocr-corpus"))
    truth_dir = args.truth_dir or (REPO_ROOT / "data" / "fixtures" / "ocr-truth" if fixture_mode else None)
    mode = "text-only" if args.text_only else "end-to-end"
    corpus = discover(corpus_dir, args.text_only, truth_dir)
    if not corpus.entries:
        print(f"채점할 파일이 없습니다: {corpus_dir}/{{receipts,labels}}", file=sys.stderr)
        return 2

    engine = None if args.text_only else RemoteOcrEngine(args.worker_url)
    health: dict[str, Any] = {}
    if engine is not None:
        try:
            import httpx

            # /ready initializes and warms up the model once, so the per-image
            # timings below measure steady-state inference, not model load.
            ready = httpx.get(f"{args.worker_url.rstrip('/')}/ready", timeout=300)
        except Exception as exc:  # noqa: BLE001
            print(f"OCR worker에 연결할 수 없습니다 ({args.worker_url}): {exc.__class__.__name__}", file=sys.stderr)
            return 3
        if ready.status_code != 200:
            print(f"OCR worker가 준비되지 않았습니다: HTTP {ready.status_code} {ready.text[:200]}", file=sys.stderr)
            return 3
        health = ready.json()

    receipts: list[dict[str, Any]] = []
    labels: list[dict[str, Any]] = []
    drafts: list[str] = []
    skipped = list(corpus.skipped)
    details: dict[str, Any] = {}

    for entry in corpus.entries:
        has_truth = entry.truth_path.exists()
        if not has_truth and args.no_drafts:
            skipped.append({"id": entry.doc_id, "reason": "정답 파일 없음"})
            continue
        result = run_text(entry.source, entry.doc_type) if engine is None else run_image(entry.source, entry.doc_type, engine)
        print(f"[{entry.doc_id}] {result.status} {result.timing_ms.get('total', 0):.1f}ms", file=sys.stderr)
        if result.status == "ocr_unavailable":
            print(f"OCR worker 오류로 중단합니다: {result.message}", file=sys.stderr)
            return 3
        if not has_truth:
            if entry.draft_path.exists() and not args.overwrite_drafts:
                skipped.append({"id": entry.doc_id, "reason": "정답 없음 (초안 이미 있음 — 고쳐서 .truth.json 으로 바꾸세요)"})
                continue
            draft = receipt_draft(result.parsed) if entry.doc_type == "receipt" else label_draft(result.parsed)  # type: ignore[arg-type]
            entry.draft_path.parent.mkdir(parents=True, exist_ok=True)
            entry.draft_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            drafts.append(entry.doc_id)
            continue
        truth = json.loads(entry.truth_path.read_text(encoding="utf-8"))
        problems = validate_truth(truth, entry.doc_type)
        if problems:
            skipped.append({"id": entry.doc_id, "reason": "정답 파일 오류: " + "; ".join(problems)})
            continue
        if entry.doc_type == "receipt":
            metrics, detail = score_receipt(result, truth, args.name_threshold)
            bucket = receipts
        else:
            metrics, detail = score_label(result, truth, args.confident_threshold)
            bucket = labels
        bucket.append(
            {
                "id": entry.doc_id,
                "status": result.status,
                "observations": result.observations,
                "quality_status": result.quality_status,
                "ocr_input_profile": result.ocr_input_profile,
                "timing_ms": {k: round(v, 2) for k, v in result.timing_ms.items()},
                "metrics": metrics,
            }
        )
        details[entry.doc_id] = {"status": result.status, "message": result.message, **detail}

    model_version = health.get("model_version")

    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        corpus_label = str(corpus_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        corpus_label = corpus_dir.name
    report: dict[str, Any] = {
        "schema": "rescue-meal.ocr-benchmark.v1",
        "generated_at": generated_at,
        "config": {
            "mode": mode,
            "corpus_label": corpus_label,
            "worker_url": None if engine is None else args.worker_url,
            "ocr_model_version": model_version,
            "name_threshold": args.name_threshold,
            "confident_threshold": args.confident_threshold,
            "python": platform.python_version(),
            "platform": f"{platform.system()} {platform.machine()}",
        },
        "scored_documents": len(receipts) + len(labels),
        "drafts_written": drafts,
        "skipped": skipped,
        "receipts": {"summary": aggregate_receipts(receipts), "documents": receipts},
        "labels": {"summary": aggregate_labels(labels), "documents": labels},
    }
    observations = auto_observations(report) + list(args.observation)
    report["observations"] = observations

    prefix = args.out or (REPO_ROOT / "evidence" / f"ocr-benchmark-{generated_at[:10]}-{mode}")
    prefix.parent.mkdir(parents=True, exist_ok=True)
    md_path = prefix.with_suffix(".md")
    json_path = prefix.with_suffix(".json")
    if report["scored_documents"]:
        md_path.write_text(render_markdown(report, observations), encoding="utf-8")
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 상세 결과에는 상품명·OCR 날짜 원문이 들어가므로 기본 위치는 항상 gitignore된
    # data/ocr-corpus/_results 이다 (corpus가 다른 곳에 있어도).
    details_dir = args.details_dir or (REPO_ROOT / "data" / "ocr-corpus" / "_results")
    details_dir.mkdir(parents=True, exist_ok=True)
    details_path = details_dir / f"details-{prefix.name}.json"
    details_path.write_text(json.dumps(details, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")

    print(f"채점 {report['scored_documents']}건, 초안 {len(drafts)}건, 건너뜀 {len(skipped)}건")
    if drafts:
        print("정답 초안을 만들었습니다. 고친 뒤 *.truth.draft.json → *.truth.json 으로 이름을 바꾸고 다시 실행하세요:")
        for doc_id in drafts:
            print(f"  - {doc_id}")
    if report["scored_documents"]:
        print(f"리포트: {md_path}")
        print(f"JSON:   {json_path}")
    print(f"상세(개인정보 포함, gitignore): {details_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
