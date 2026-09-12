from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Literal

from ..barcode import parse_barcode
from .ocr import OcrObservation


ReceiptKind = Literal["grocery_receipt", "retail_beverage_receipt", "restaurant_receipt", "unknown"]
ReceiptTemplateId = Literal["grocery-mart-v1", "retail-beverage-v1", "restaurant-card-v1", "grocery-generic-v1", "generic-v1"]
ParsedLineType = Literal["product", "discount", "refund", "subtotal", "payment", "unknown"]

_ITEM_NUMBER_RE = r"^\s*\d{3}(?=\s|[가-힣A-Za-z]|$)"
_PRODUCT_PREFIX_RE = r"^\s*(\d{1,3})(?=\s|[가-힣A-Za-z]|$)\s*(.*)$"


@dataclass(frozen=True)
class ParsedReceiptLine:
    raw_name: str
    quantity: float
    unit: str
    unit_price: int | None
    total_price: int | None
    line_type: ParsedLineType
    canonical_name: str | None
    match_confidence: float
    review_reason: str | None
    # Original observation indexes are metadata for the review surface only.
    # OCR text is intentionally not copied into the public response here.
    observation_indices: tuple[int, ...] = ()
    # A receipt usually contains a product identifier, not a package date.
    # Only a normal GTIN is retained; restricted-circulation/store codes stay
    # unset so they cannot be mistaken for a product barcode.
    barcode: str | None = None


@dataclass(frozen=True)
class ParsedReceipt:
    kind: ReceiptKind
    purchased_at: datetime | None
    lines: list[ParsedReceiptLine]
    warnings: list[str]
    template_id: ReceiptTemplateId = "generic-v1"
    template_confidence: float = 0.0
    merchant_name: str | None = None


def parse_receipt_text(text: str) -> ParsedReceipt:
    raw_lines = [line.strip() for line in text.splitlines() if line.strip()]
    kind = classify_receipt(raw_lines)
    template_id, template_confidence = detect_receipt_template(raw_lines)
    merchant_name = extract_merchant_name(raw_lines)
    purchased_at = _find_purchased_at(raw_lines)
    parsed_lines: list[ParsedReceiptLine] = []
    warnings: list[str] = []
    index = 0

    while index < len(raw_lines):
        line = raw_lines[index]
        line_type = _classify_line_type(line)
        if line_type == "product" and re.match(r"^\d{1,3}\b", line):
            combined = line
            amount_index = _next_amount_row_index(raw_lines, index)
            barcode = _first_gtin_from_rows(
                raw_lines[index + 1:amount_index] if amount_index is not None else raw_lines[index + 1:index + 3]
            )
            if amount_index is not None:
                combined = f"{line} {raw_lines[amount_index]}"
                index = amount_index
            parsed_lines.append(replace(_parse_product_line(combined), barcode=barcode))
        elif line_type != "unknown":
            parsed_lines.append(_parse_non_product_line(line, line_type))
        index += 1

    if kind == "restaurant_receipt":
        warnings.append("식당 영수증은 식료품 재고로 자동 입고하지 않습니다.")
    if not parsed_lines:
        warnings.append("상품 라인을 찾지 못했습니다.")
    return ParsedReceipt(kind, purchased_at, parsed_lines, warnings, template_id, template_confidence, merchant_name)


def parse_receipt_observations(observations: list[OcrObservation]) -> ParsedReceipt:
    # Bounding-box aware ordering is intentionally kept deterministic. The
    # first implementation accepts OCR text rows; a later layout adapter can
    # replace this without changing the parser contract.
    ordered_pairs = sorted(
        enumerate(observations),
        # Vision coordinates use a bottom-left origin, so larger y values are
        # visually higher on the receipt. Read rows from top to bottom.
        key=lambda indexed: (
            -(indexed[1].bbox[1] if indexed[1].bbox and len(indexed[1].bbox) > 1 else 0),
            indexed[1].bbox[0] if indexed[1].bbox else 0,
        ),
    )
    ordered = [item for _, item in ordered_pairs]
    ordered_original_indices = [original_index for original_index, _ in ordered_pairs]
    item_anchors = [index for index, item in enumerate(ordered) if _is_item_anchor(item)]
    if not item_anchors:
        return parse_receipt_text("\n".join(item.text for item in ordered))

    parsed_lines: list[ParsedReceiptLine] = []
    for anchor_index, start in enumerate(item_anchors):
        end = item_anchors[anchor_index + 1] if anchor_index + 1 < len(item_anchors) else len(ordered)
        start = _pull_adjacent_name_observations(ordered, start, item_anchors[anchor_index - 1] if anchor_index else 0)
        segment = ordered[start:end]
        product_observation_pairs: list[tuple[int, OcrObservation]] = []
        for segment_index, item in enumerate(segment, start=start):
            line_type = _classify_line_type(item.text)
            if line_type in {"discount", "refund", "subtotal", "payment"}:
                parsed_lines.append(_parse_non_product_line(item.text, line_type))
            else:
                product_observation_pairs.append((ordered_original_indices[segment_index], item))
        product_line = _parse_product_observation_group([item for _, item in product_observation_pairs])
        parsed_lines.append(replace(product_line, observation_indices=tuple(index for index, _ in product_observation_pairs)))

    full_text = "\n".join(item.text for item in ordered)
    full_lines = full_text.splitlines()
    template_id, template_confidence = detect_receipt_template(full_lines)
    return ParsedReceipt(classify_receipt(full_lines), _find_purchased_at(full_lines), parsed_lines, _receipt_warnings(full_text, parsed_lines), template_id, template_confidence, extract_merchant_name(full_lines))


def _pull_adjacent_name_observations(ordered: list[OcrObservation], start: int, previous_anchor: int) -> int:
    anchor = ordered[start]
    anchor_y = anchor.bbox[1] if anchor.bbox and len(anchor.bbox) > 1 else None
    if anchor_y is None:
        return start
    candidate = start - 1
    while candidate >= previous_anchor:
        observation = ordered[candidate]
        if not observation.bbox or len(observation.bbox) < 2:
            break
        if abs(observation.bbox[1] - anchor_y) > 0.035 or observation.bbox[0] > 0.4:
            break
        text = observation.text.strip()
        if not text or _classify_line_type(text) in {"discount", "refund", "subtotal", "payment"} or not re.search(r"[가-힣A-Za-z]", text):
            break
        start = candidate
        candidate -= 1
    return start


def _is_item_anchor(observation: OcrObservation) -> bool:
    if not re.match(_ITEM_NUMBER_RE, observation.text):
        return False
    if observation.bbox and len(observation.bbox) > 0:
        # Receipt item numbers live in the leftmost column. A right-aligned
        # amount such as “020” must not start a new product segment.
        return observation.bbox[0] <= 0.25
    return True


def classify_receipt(lines: list[str]) -> ReceiptKind:
    full_text = " ".join(lines)
    normalized_text = full_text.lower()
    if any(token in full_text for token in ("테이블", "주문담당", "식당", "카드전표", "메뉴명")):
        return "restaurant_receipt"
    if any(token in normalized_text for token in ("주류", "맥주", "소주", "음료", "와인", "조니워커", "하이네켄", "삿포로", "아사히", "칭타오", "500ml")):
        return "retail_beverage_receipt"
    if any(token in full_text for token in ("상품명", "판매일", "계산대", "수량", "영수증")):
        return "grocery_receipt"
    return "unknown"


def detect_receipt_template(lines: list[str]) -> tuple[ReceiptTemplateId, float]:
    """Select a conservative parser profile from safe header/type signals."""

    full_text = " ".join(lines)
    kind = classify_receipt(lines)
    if kind == "restaurant_receipt":
        return "restaurant-card-v1", 0.98
    if kind == "retail_beverage_receipt":
        return "retail-beverage-v1", 0.94
    if kind == "grocery_receipt":
        if re.search(r"마트|식자재|계산대|판매일", full_text):
            return "grocery-mart-v1", 0.9
        return "grocery-generic-v1", 0.78
    return "generic-v1", 0.35


def extract_merchant_name(lines: list[str]) -> str | None:
    """Return only a high-confidence business-name header candidate."""

    product_index = next(
        (index for index, line in enumerate(lines) if _classify_line_type(line) == "product"),
        len(lines),
    )
    for line in lines[:product_index]:
        candidate = re.sub(r"^\s*(?:\(주\)|주식회사)\s*", "", line).strip(" :")
        if not candidate or len(candidate) > 80:
            continue
        if re.search(r"주소|대표자|사업자|전화|TEL|판매일|계산대|상품명|영수증|합계|금액", candidate, re.IGNORECASE):
            continue
        if re.search(r"(?:마트|식자재|편의점|슈퍼|시장|백화점|농협|이마트|홈플러스|롯데마트|GS25|CU|세븐일레븐)$", candidate, re.IGNORECASE):
            return candidate
    return None


def _classify_line_type(line: str) -> ParsedLineType:
    normalized = line.replace(" ", "")
    if re.search(r"특매할인|특매합인|쿠폰|할인", normalized):
        return "discount"
    if re.search(r"환불|반품", normalized):
        return "refund"
    if re.search(r"소계|합계|총액", normalized):
        return "subtotal"
    if re.search(r"결제|카드|현금|승인", normalized):
        return "payment"
    if re.match(r"^\s*\d{1,3}(?=\s|[가-힣A-Za-z]|$)", line):
        return "product"
    return "unknown"


def _parse_product_line(line: str) -> ParsedReceiptLine:
    prefix_match = re.match(_PRODUCT_PREFIX_RE, line)
    rest = prefix_match.group(2).strip() if prefix_match else line.strip()
    numbers = re.findall(r"-?\d[\d,]*", rest)
    quantity = 1.0
    unit_price = None
    total_price = None
    if len(numbers) >= 3:
        unit_price = _int(numbers[-3])
        quantity = float(_int(numbers[-2]) or 1)
        total_price = _int(numbers[-1])
        # The same amount token can appear in a product size (e.g. 500ml),
        # so rfind() is unsafe. Strip exactly the trailing price/quantity/total
        # triplet and keep numeric size information inside the product name.
        tail = re.search(r"(?P<name>.+?)(?:\s+-?\d[\d,]*){3}\s*$", rest)
        name = tail.group("name").strip() if tail else rest
    else:
        name = rest
    name = re.sub(r"\s+#?$", "", name).strip()
    canonical = _normalize_product_name(name)
    confidence = 0.9 if unit_price is not None and total_price is not None else 0.58
    reason = None if confidence >= 0.8 else "금액 행 또는 수량이 완전히 연결되지 않았습니다."
    return ParsedReceiptLine(name, quantity, _unit_from_name(name), unit_price, total_price, "product", canonical, confidence, reason)


def _parse_product_observation_group(observations: list[OcrObservation]) -> ParsedReceiptLine:
    if not observations:
        return ParsedReceiptLine("알 수 없는 상품", 1, "개", None, None, "product", None, 0, "OCR 상품 구간이 비어 있습니다.")

    first = observations[0].text.strip()
    prefix_match = re.match(_PRODUCT_PREFIX_RE, first)
    anchor_name = prefix_match.group(2).strip() if prefix_match else first
    name_parts: list[str] = []
    unit_candidates: list[int] = []
    total_candidates: list[int] = []
    quantity_candidates: list[int] = []

    for observation in observations:
        text = observation.text.strip()
        line_type = _classify_line_type(text)
        if line_type != "unknown" and line_type != "product":
            continue
        numeric_values = _amount_values(text)
        for value in numeric_values:
            if value >= 100:
                x = observation.bbox[0] if observation.bbox else 0.5
                if x >= 0.65:
                    total_candidates.append(value)
                elif value < 100_000:
                    unit_candidates.append(value)
            elif 0 < value <= 99 and observation.bbox and 0.52 <= observation.bbox[0] <= 0.70:
                quantity_candidates.append(value)

        cleaned = _clean_observation_name(text)
        if cleaned and re.search(r"[가-힣A-Za-z]", cleaned):
            if cleaned not in name_parts:
                name_parts.append(cleaned)

    name = " ".join(name_parts).strip() or anchor_name or "알 수 없는 상품"
    raw_segment = " ".join(item.text for item in observations)
    quantity = float(quantity_candidates[-1]) if quantity_candidates else _quantity_from_name(raw_segment)
    unit = _unit_from_name(raw_segment)
    unit_price = unit_candidates[-1] if unit_candidates else None
    total_price = total_candidates[-1] if total_candidates else None
    barcode = _first_gtin_from_rows([item.text for item in observations])
    confidence = 0.94 if unit_price is not None and total_price is not None and quantity_candidates else 0.72 if unit_price is not None and total_price is not None else 0.56
    reason = None if confidence >= 0.8 else "OCR observation에서 수량 또는 금액 일부가 확인되지 않았습니다."
    return ParsedReceiptLine(name, quantity, unit, unit_price, total_price, "product", _normalize_product_name(name), confidence, reason, barcode=barcode)


def _amount_values(text: str) -> list[int]:
    values: list[int] = []
    for raw in re.findall(r"-?\d[\d,]*", text):
        compact = raw.replace(",", "")
        try:
            value = int(compact)
        except ValueError:
            continue
        # Eight-plus digit values are overwhelmingly barcodes in these receipt
        # observations; six-digit unformatted values are store item codes.
        if len(compact) >= 8 or (len(compact) == 6 and "," not in raw):
            continue
        values.append(value)
    return values


def _clean_observation_name(text: str) -> str:
    cleaned = re.sub(r"^\s*\d{1,3}(?=\s|[가-힣A-Za-z]|$)\s*", "", text)
    cleaned = re.sub(r"-?\d[\d,]*", " ", cleaned)
    cleaned = re.sub(r"\b(?:kg|g|ml|mL|L|팩|개|입|구|병|캔|박스)\b", " ", cleaned)
    cleaned = re.sub(r"\(\s*\)", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" *#")
    return cleaned


def _quantity_from_name(name: str) -> float:
    match = re.search(r"(?:\(|\s)(\d+(?:\.\d+)?)\s*(?:개|팩|입|구|병|캔|박스|봉|단|모|통|줄)\b", name)
    return float(match.group(1)) if match else 1.0


def _unit_from_name(name: str) -> str:
    # Weight/volume (g, kg, ml, L) describes the package, not the purchased
    # count. Keep the API quantity unit count-based until a dedicated weight
    # field is populated from the receipt/label parser.
    parenthesized_unit = re.search(r"\((개|팩|입|구|병|캔|박스|봉|단|모|통|줄)\)", name)
    if parenthesized_unit:
        return parenthesized_unit.group(1)
    match = re.search(r"(?:\d+(?:\.\d+)?)\s*(개|팩|입|구|병|캔|박스|봉|단|모|통|줄)\b", name)
    return match.group(1) if match else "개"


def _receipt_warnings(full_text: str, parsed_lines: list[ParsedReceiptLine]) -> list[str]:
    warnings: list[str] = []
    kind = classify_receipt(full_text.splitlines())
    if kind == "restaurant_receipt":
        warnings.append("식당 영수증은 식료품 재고로 자동 입고하지 않습니다.")
    if any(line.review_reason for line in parsed_lines):
        warnings.append("일부 상품 line은 수량 또는 금액 확인이 필요합니다.")
    return warnings


def _parse_non_product_line(line: str, line_type: ParsedLineType) -> ParsedReceiptLine:
    numbers = re.findall(r"-?\d[\d,]*", line)
    amount = _int(numbers[-1]) if numbers else None
    if line_type in {"discount", "refund"} and amount is not None and amount > 0:
        amount = -amount
    return ParsedReceiptLine(line, 1, "식", None, amount, line_type, None, 1.0, None)


def _looks_like_amount_row(line: str) -> bool:
    tokens = re.findall(r"-?\d[\d,]*", line)
    return len(tokens) >= 2 and not re.match(r"^\d{1,3}\s+\D", line)


def _next_amount_row_index(lines: list[str], product_index: int) -> int | None:
    """Find the amount row after optional barcode/store-code-only rows."""

    candidate = product_index + 1
    skipped_code_rows = 0
    while candidate < len(lines) and skipped_code_rows < 2 and _is_code_only_row(lines[candidate]):
        skipped_code_rows += 1
        candidate += 1
    return candidate if candidate < len(lines) and _looks_like_amount_row(lines[candidate]) else None


def _is_code_only_row(line: str) -> bool:
    # A spaced amount row such as "750 1 750" must not become a code after
    # whitespace removal. Be conservative: only a single contiguous numeric
    # token is treated as a barcode/store-code continuation.
    tokens = line.strip().split()
    return len(tokens) == 1 and re.fullmatch(r"\d{6,14}", tokens[0]) is not None


def _first_gtin_from_rows(rows: list[str]) -> str | None:
    """Return the first normal GTIN in receipt continuation rows.

    Receipt OCR often emits a barcode or store SKU on its own row. The
    parser may skip both kinds of rows to reach the amount row, but only a
    barcode parser-confirmed GTIN is safe to expose as a product identifier.
    In particular, codes beginning with ``2`` remain restricted-circulation
    candidates and are deliberately not promoted to a GTIN.
    """

    for row in rows:
        if not _is_code_only_row(row):
            continue
        parsed = parse_barcode(row)
        if parsed.barcode_type == "gtin" and parsed.gtin:
            return parsed.gtin
    return None


def _find_purchased_at(lines: list[str]) -> datetime | None:
    for line in lines:
        match = re.search(r"(20\d{2}|\d{2})[-./~년](\d{1,2})[-./~월](\d{1,2})", line)
        if not match:
            continue
        year = int(match.group(1))
        year += 2000 if year < 100 else 0
        try:
            return datetime(year, int(match.group(2)), int(match.group(3)))
        except ValueError:
            continue
    return None


def _normalize_product_name(name: str) -> str:
    normalized = re.sub(r"\s+", " ", name).strip()
    normalized = re.sub(r"\s+(?:\d+(?:\.\d+)?\s*(?:kg|g|ml|L|개|팩|모|병|캔|구))$", "", normalized, flags=re.IGNORECASE)
    if "시금치" in normalized:
        return "시금치"
    if "두부" in normalized:
        return "국산콩 두부"
    if "버섯" in normalized:
        return "맛타리버섯"
    if "달걀" in normalized or "계란" in normalized:
        return "동물복지 달걀"
    return normalized or None


def _int(value: str) -> int | None:
    try:
        return int(value.replace(",", ""))
    except ValueError:
        return None
