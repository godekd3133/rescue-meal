from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal


LabelDateKind = Literal["production_date", "packaging_date", "sell_by", "use_by", "best_before", "unknown"]
StorageHint = Literal["ambient", "refrigerated", "frozen", "unknown"]


@dataclass(frozen=True)
class LabelDateCandidate:
    kind: LabelDateKind
    value: date
    raw_text: str
    confidence: float
    requires_review: bool
    context: str


@dataclass(frozen=True)
class ParsedLabel:
    product_name: str | None
    barcode: str | None
    date_candidates: list[LabelDateCandidate]
    storage_hint: StorageHint
    warnings: list[str]
    requires_review: bool

    @property
    def consumption_date_candidate(self) -> LabelDateCandidate | None:
        trusted = [candidate for candidate in self.date_candidates if candidate.kind in {"use_by", "sell_by", "best_before"}]
        return max(trusted, key=lambda candidate: candidate.confidence, default=None)


_DATE_RE = re.compile(
    r"(?<!\d)(?P<year>19\d{2}|20\d{2})\s*[./-년]\s*(?P<month>\d{1,2})\s*[./-월]\s*(?P<day>\d{1,2})\s*일?"
    r"|(?<!\d)(?P<compact>20\d{6})(?!\d)"
)
_BARCODE_RE = re.compile(r"(?<!\d)(?:\d[ \t-]?){8,14}(?!\d)")


def parse_label_text(text: str) -> ParsedLabel:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates: list[LabelDateCandidate] = []
    warnings: list[str] = []
    for match in _DATE_RE.finditer(text):
        value = _parse_date(match)
        if value is None:
            continue
        context = text[max(0, match.start() - 32) : min(len(text), match.end() + 32)]
        kind, confidence = _classify_date_context(context)
        # Even an explicit “소비기한” label is still an OCR candidate until
        # the user confirms the crop/value. Semantic certainty is not the same
        # as visual recognition certainty.
        candidates.append(LabelDateCandidate(kind, value, match.group(0), confidence, True, context))

    product_name = _find_product_name(lines)
    barcode = _find_barcode(text, candidates)
    storage_hint = _storage_hint(text)
    trusted_date = next((candidate for candidate in candidates if candidate.kind in {"use_by", "sell_by", "best_before"}), None)
    if candidates and trusted_date is None:
        warnings.append("날짜 숫자는 보이지만 소비기한 의미가 확인되지 않았습니다.")
    if not candidates:
        warnings.append("소비기한·유통기한 숫자를 찾지 못했습니다. 다른 면이나 뚜껑을 촬영해 주세요.")
    if barcode and barcode.startswith("2"):
        barcode = None
    if _has_restricted_barcode_candidate(text):
        warnings.append("첫 숫자가 2인 바코드는 가변중량 또는 매장용 코드일 수 있어 글로벌 GTIN으로 확정하지 않습니다.")
    return ParsedLabel(product_name, barcode, candidates, storage_hint, warnings, bool(warnings) or len(candidates) != 1)


def _classify_date_context(context: str) -> tuple[LabelDateKind, float]:
    normalized = context.replace(" ", "")
    labels: tuple[tuple[LabelDateKind, tuple[str, ...], float], ...] = (
        ("use_by", ("소비기한", "유효년월일", "유효년.월.일", "유효기간", "expiration"), 0.94),
        ("sell_by", ("유통기한", "판매기한", "sellby"), 0.92),
        ("best_before", ("품질유지기한", "bestbefore"), 0.9),
        ("production_date", ("제조일", "생산일"), 0.86),
        ("packaging_date", ("포장일", "포장)년", "포장년월일", "포장)년.월.일"), 0.84),
    )
    matches = [(kind, confidence) for kind, tokens, confidence in labels if any(token in normalized.lower() for token in tokens)]
    if len({kind for kind, _ in matches}) > 1:
        # A crop can contain adjacent columns such as “(포장)년·월·일” and
        # “유효년·월·일”. Without the value's x-coordinate, selecting one
        # would be a dangerous semantic guess.
        return "unknown", 0.35
    if matches:
        return matches[0]
    return "unknown", 0.45


def _parse_date(match: re.Match[str]) -> date | None:
    try:
        if match.group("compact"):
            compact = match.group("compact")
            return date(int(compact[:4]), int(compact[4:6]), int(compact[6:8]))
        return date(int(match.group("year")), int(match.group("month")), int(match.group("day")))
    except (TypeError, ValueError):
        return None


def _find_product_name(lines: list[str]) -> str | None:
    for line in lines:
        if any(token in line for token in ("제품명", "상품명")):
            candidate = re.split(r"제품명|상품명", line, maxsplit=1)[-1].strip(" :")
            if candidate:
                return candidate
    return next((line for line in lines if len(line) >= 2 and not re.fullmatch(r"[\d .:/-]+", line)), None)


def _find_barcode(text: str, candidates: list[LabelDateCandidate]) -> str | None:
    del candidates
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        spans = [(match.start(), match.end()) for match in _DATE_RE.finditer(line)]
        for match in _BARCODE_RE.finditer(line):
            raw = re.sub(r"[\s-]", "", match.group(0))
            if any(start <= match.start() <= end or start <= match.end() <= end for start, end in spans):
                continue
            separators = re.findall(r"[ \t-]", match.group(0))
            digit_groups = re.findall(r"\d+", match.group(0))
            # OCR often emits a variable-weight code as separate observations
            # such as `2` / `308490 023003`. Do not silently join or accept a
            # two-group fragment without an explicit barcode label.
            if separators and len(digit_groups) < 3 and "바코드" not in line.lower():
                continue
            if 8 <= len(raw) <= 14:
                if raw.startswith("2"):
                    continue
                return raw
    return None


def _has_restricted_barcode_candidate(text: str) -> bool:
    for line in text.splitlines():
        compact = re.sub(r"[\s-]", "", line)
        if re.search(r"(?<!\d)2\d{8,14}(?!\d)", compact):
            return True
        groups = re.findall(r"\d+", line)
        if len(groups) >= 3 and groups[0] == "2" and 8 <= len("".join(groups)) <= 14:
            return True
    return False


def _storage_hint(text: str) -> StorageHint:
    if "냉동" in text:
        return "frozen"
    if "냉장" in text:
        return "refrigerated"
    if "실온" in text:
        return "ambient"
    return "unknown"
