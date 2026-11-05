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
    storage_condition_text: str | None
    warnings: list[str]
    requires_review: bool

    @property
    def consumption_date_candidate(self) -> LabelDateCandidate | None:
        trusted = [candidate for candidate in self.date_candidates if candidate.kind in {"use_by", "sell_by", "best_before"}]
        return max(trusted, key=lambda candidate: candidate.confidence, default=None)


_DATE_RE = re.compile(
    r"(?<!\d)(?P<year>19\d{2}|20\d{2})\s*[./년-]\s*(?P<month>\d{1,2})\s*[./월-]\s*(?P<day>\d{1,2})\s*일?"
    r"|(?<![A-Za-z0-9])(?P<compact>20\d{6})(?![A-Za-z0-9])"
    # Korean labels commonly print `YY.MM.DD`. The separator must repeat so a
    # price (`2.500`) or a weight (`1.5kg`) cannot form a date.
    r"|(?<![\d.,A-Za-z])(?P<short_year>[2-3]\d)(?P<short_sep>[./-])(?P<short_month>\d{1,2})(?P=short_sep)(?P<short_day>\d{1,2})(?![\d.,])"
)
_BARCODE_RE = re.compile(r"(?<!\d)(?:\d[ \t-]?){8,14}(?!\d)")
_DATE_CONTEXT_RADIUS = 128
_SPLIT_WEIGHT_CODE_RE = re.compile(r'''["“”']?\d(?:[\s-]?\d){9,12}["“”']?''')


def parse_label_text(text: str) -> ParsedLabel:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates: list[LabelDateCandidate] = []
    warnings: list[str] = []
    date_matches = [(match, _parse_date(match)) for match in _DATE_RE.finditer(text)]
    date_matches = [(match, value) for match, value in date_matches if value is not None]
    lot_excluded = False
    short_year_seen = False
    for position, (match, value) in enumerate(date_matches):
        if _is_lot_number_context(text, match):
            # A LOT/제조번호 such as `LOT 20261015` is shaped like a compact
            # date but is not one. Never offer it as a date candidate: a wrong
            # consumption date is worse than no date.
            lot_excluded = True
            continue
        context = text[max(0, match.start() - 32) : min(len(text), match.end() + 32)]
        previous_end = date_matches[position - 1][0].end() if position else None
        next_start = date_matches[position + 1][0].start() if position + 1 < len(date_matches) else None
        kind, confidence = _classify_date(text, match, previous_end, next_start)
        if match.group("compact"):
            # Eight undivided digits are as likely to be a code as a date.
            # Keep the candidate for the user, but never as a confident pick.
            confidence = min(confidence, _UNCONFIRMED_SHAPE_CONFIDENCE)
        if match.group("short_year"):
            # `26.11.20` can also be read as DD.MM.YY; the user must confirm.
            short_year_seen = True
            confidence = min(confidence, _UNCONFIRMED_SHAPE_CONFIDENCE)
        # Even an explicit “소비기한” label is still an OCR candidate until
        # the user confirms the crop/value. Semantic certainty is not the same
        # as visual recognition certainty.
        candidates.append(LabelDateCandidate(kind, value, match.group(0), confidence, True, context))
    if lot_excluded:
        warnings.append("제조번호(LOT)로 보이는 숫자는 날짜 후보에서 뺐습니다. 날짜가 따로 인쇄되어 있는지 확인해 주세요.")
    if short_year_seen:
        warnings.append("연도가 두 자리인 날짜는 연·월·일 순서로 읽었습니다. 날짜를 확인해 주세요.")

    product_name = _find_product_name(lines)
    barcode = _find_barcode(text, candidates)
    restricted_barcode = _has_restricted_barcode_candidate(text)
    storage_hint = _storage_hint(text)
    storage_condition_text = _storage_condition_text(text, storage_hint)
    trusted_date = next((candidate for candidate in candidates if candidate.kind in {"use_by", "sell_by", "best_before"}), None)
    if candidates and trusted_date is None:
        warnings.append("날짜 숫자는 보이지만 소비기한 의미가 확인되지 않았습니다.")
    if not candidates:
        warnings.append("소비기한·유통기한 숫자를 찾지 못했습니다. 다른 면이나 뚜껑을 촬영해 주세요.")
    if barcode and barcode.startswith("2"):
        barcode = None
    if restricted_barcode:
        # A variable-weight/store code must never become a product lookup key,
        # even if OCR split its leading `2` into one observation and emitted
        # the remaining digits as a normal-looking 10–13 digit line.
        barcode = None
        warnings.append("첫 숫자가 2인 바코드는 가변중량 또는 매장용 코드일 수 있어 글로벌 GTIN으로 확정하지 않습니다.")
    return ParsedLabel(
        product_name,
        barcode,
        candidates,
        storage_hint,
        storage_condition_text,
        warnings,
        bool(warnings) or len(candidates) != 1 or any(candidate.requires_review for candidate in candidates),
    )


_DATE_LABELS: tuple[tuple[LabelDateKind, tuple[str, ...], float], ...] = (
    ("use_by", ("소비기한", "유효년월일", "유효년.월.일", "유효기간", "expiration"), 0.94),
    ("sell_by", ("유통기한", "판매기한", "sellby"), 0.92),
    ("best_before", ("품질유지기한", "bestbefore"), 0.9),
    ("production_date", ("제조일", "생산일"), 0.86),
    ("packaging_date", ("포장일", "포장)년", "포장년월일", "포장)년.월.일"), 0.84),
)
# A keyword that is not printed next to the value (another line, or after the
# value) is weaker evidence. It may still name the kind, but the candidate
# must stay below the app's “confident” threshold (0.8).
_DISTANT_KEYWORD_CONFIDENCE = 0.7
_UNCONFIRMED_SHAPE_CONFIDENCE = 0.6
_LOT_PREFIX_RE = re.compile(
    r"(?:lot|l/n|batch|로트|제조번호|생산번호|일련번호|배치번호|제품번호)\s*(?:no\.?|번호)?\s*[:.#)\]-]?\s*$",
    re.IGNORECASE,
)


def _date_kinds(segment: str) -> list[tuple[LabelDateKind, float]]:
    normalized = segment.replace(" ", "").lower()
    return [(kind, confidence) for kind, tokens, confidence in _DATE_LABELS if any(token in normalized for token in tokens)]


def _classify_date(
    text: str, match: re.Match[str], previous_date_end: int | None, next_date_start: int | None
) -> tuple[LabelDateKind, float]:
    line_start = text.rfind("\n", 0, match.start()) + 1
    line_end_index = text.find("\n", match.end())
    line_end = len(text) if line_end_index == -1 else line_end_index

    # 1. The keyword printed right before the value on the same line wins:
    #    `제조일 2026.10.25 / 소비기한 2026.11.08` or
    #    `유통기한 2026.11.20 제조일 2026.10.20`.
    prefix_start = max(line_start, previous_date_end or line_start)
    prefix_kinds = _date_kinds(text[prefix_start : match.start()])
    if len({kind for kind, _ in prefix_kinds}) == 1:
        return prefix_kinds[0]
    if len({kind for kind, _ in prefix_kinds}) > 1:
        return "unknown", 0.35

    # 2. A keyword after the value on the same line (`2026.11.08 소비기한`),
    #    only when no other date follows on that line — otherwise the keyword
    #    most likely labels the next value.
    if next_date_start is None or next_date_start > line_end:
        suffix_kinds = _date_kinds(text[match.end() : line_end])
        if len({kind for kind, _ in suffix_kinds}) == 1:
            return suffix_kinds[0][0], min(suffix_kinds[0][1], _DISTANT_KEYWORD_CONFIDENCE)
        if len({kind for kind, _ in suffix_kinds}) > 1:
            return "unknown", 0.35

    shares_line_with_other_date = (previous_date_end is not None and previous_date_end > line_start) or (
        next_date_start is not None and next_date_start < line_end
    )
    if shares_line_with_other_date:
        # `2026.11.20 제조일 2026.10.20`: the only keyword labels the other
        # value. Reusing it here would be a semantic guess.
        return "unknown", 0.35

    # 3. OCR engines commonly return each detected text box as a separate
    #    line. Classify against a wider window so a heading such as
    #    `(포장)년·월·일` is not lost when the value appears a few observations
    #    below it, but never treat that as confident.
    window = text[max(0, match.start() - _DATE_CONTEXT_RADIUS) : min(len(text), match.end() + _DATE_CONTEXT_RADIUS)]
    window_kinds = _date_kinds(window)
    if len({kind for kind, _ in window_kinds}) > 1:
        # A crop can contain adjacent columns such as “(포장)년·월·일” and
        # “유효년·월·일”. Without the value's x-coordinate, selecting one
        # would be a dangerous semantic guess.
        return "unknown", 0.35
    if window_kinds:
        return window_kinds[0][0], min(window_kinds[0][1], _DISTANT_KEYWORD_CONFIDENCE)
    return "unknown", 0.45


def _is_lot_number_context(text: str, match: re.Match[str]) -> bool:
    line_start = text.rfind("\n", 0, match.start()) + 1
    if _LOT_PREFIX_RE.search(text[line_start : match.start()]):
        return True
    if line_start == 0 or text[line_start : match.start()].strip():
        return False
    # OCR may split `LOT` and its digits into two observations (two lines).
    previous_line_start = text.rfind("\n", 0, line_start - 1) + 1
    return bool(_LOT_PREFIX_RE.fullmatch(text[previous_line_start : line_start - 1].strip()))


def _parse_date(match: re.Match[str]) -> date | None:
    try:
        if match.group("compact"):
            compact = match.group("compact")
            return date(int(compact[:4]), int(compact[4:6]), int(compact[6:8]))
        if match.group("short_year"):
            return date(2000 + int(match.group("short_year")), int(match.group("short_month")), int(match.group("short_day")))
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
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        compact = re.sub(r"[\s-]", "", line)
        if re.search(r"(?<!\d)2\d{8,14}(?!\d)", compact):
            return True
        groups = re.findall(r"\d+", line)
        if len(groups) >= 3 and groups[0] == "2" and 8 <= len("".join(groups)) <= 14:
            return True
        if compact == "2":
            # In a real OCR result the next observation may be a quoted,
            # unspaced payload (`2` / `"3084901023003`) rather than one line
            # matching the normal barcode regex. Ten to thirteen following
            # digits are enough to identify this shape while avoiding dates
            # such as `2017.06.28`.
            for following_line in lines[index + 1 : index + 3]:
                if _SPLIT_WEIGHT_CODE_RE.fullmatch(following_line):
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


def _storage_condition_text(text: str, storage_hint: StorageHint) -> str | None:
    if storage_hint == "unknown":
        return None
    normalized_hint = {"ambient": "실온", "refrigerated": "냉장", "frozen": "냉동"}[storage_hint]
    for line in text.splitlines():
        normalized_line = re.sub(r"\s+", " ", line).strip()
        if normalized_hint in normalized_line and ("보관" in normalized_line or "℃" in normalized_line or "도" in normalized_line):
            return normalized_line[:160]
    return f"포장지에 {normalized_hint} 보관 표시"
