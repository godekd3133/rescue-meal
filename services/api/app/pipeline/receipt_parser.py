from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from .ocr import OcrObservation


ReceiptKind = Literal["grocery_receipt", "retail_beverage_receipt", "restaurant_receipt", "unknown"]
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


@dataclass(frozen=True)
class ParsedReceipt:
    kind: ReceiptKind
    purchased_at: datetime | None
    lines: list[ParsedReceiptLine]
    warnings: list[str]


def parse_receipt_text(text: str) -> ParsedReceipt:
    raw_lines = [line.strip() for line in text.splitlines() if line.strip()]
    kind = classify_receipt(raw_lines)
    purchased_at = _find_purchased_at(raw_lines)
    parsed_lines: list[ParsedReceiptLine] = []
    warnings: list[str] = []
    index = 0

    while index < len(raw_lines):
        line = raw_lines[index]
        line_type = _classify_line_type(line)
        if line_type == "product" and re.match(r"^\d{1,3}\b", line):
            combined = line
            if index + 1 < len(raw_lines) and _looks_like_amount_row(raw_lines[index + 1]):
                combined = f"{line} {raw_lines[index + 1]}"
                index += 1
            parsed_lines.append(_parse_product_line(combined))
        elif line_type != "unknown":
            parsed_lines.append(_parse_non_product_line(line, line_type))
        index += 1

    if kind == "restaurant_receipt":
        warnings.append("식당 영수증은 식료품 재고로 자동 입고하지 않습니다.")
    if not parsed_lines:
        warnings.append("상품 라인을 찾지 못했습니다.")
    return ParsedReceipt(kind, purchased_at, parsed_lines, warnings)


def parse_receipt_observations(observations: list[OcrObservation]) -> ParsedReceipt:
    # Bounding-box aware ordering is intentionally kept deterministic. The
    # first implementation accepts OCR text rows; a later layout adapter can
    # replace this without changing the parser contract.
    ordered = sorted(
        observations,
        # Vision coordinates use a bottom-left origin, so larger y values are
        # visually higher on the receipt. Read rows from top to bottom.
        key=lambda item: (-(item.bbox[1] if item.bbox and len(item.bbox) > 1 else 0), item.bbox[0] if item.bbox else 0),
    )
    item_anchors = [index for index, item in enumerate(ordered) if _is_item_anchor(item)]
    if not item_anchors:
        return parse_receipt_text("\n".join(item.text for item in ordered))

    parsed_lines: list[ParsedReceiptLine] = []
    for anchor_index, start in enumerate(item_anchors):
        end = item_anchors[anchor_index + 1] if anchor_index + 1 < len(item_anchors) else len(ordered)
        start = _pull_adjacent_name_observations(ordered, start, item_anchors[anchor_index - 1] if anchor_index else 0)
        segment = ordered[start:end]
        product_observations: list[OcrObservation] = []
        for item in segment:
            line_type = _classify_line_type(item.text)
            if line_type in {"discount", "refund", "subtotal", "payment"}:
                parsed_lines.append(_parse_non_product_line(item.text, line_type))
            else:
                product_observations.append(item)
        parsed_lines.append(_parse_product_observation_group(product_observations))

    full_text = "\n".join(item.text for item in ordered)
    return ParsedReceipt(classify_receipt(full_text.splitlines()), _find_purchased_at(full_text.splitlines()), parsed_lines, _receipt_warnings(full_text, parsed_lines))


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
    if any(token in full_text for token in ("테이블", "주문담당", "식당", "카드전표", "메뉴명")):
        return "restaurant_receipt"
    if any(token in full_text for token in ("주류", "맥주", "소주", "음료", "와인", "조니워커", "하이네켄", "삿포로", "아사히", "칭타오", "500ml")):
        return "retail_beverage_receipt"
    if any(token in full_text for token in ("상품명", "판매일", "계산대", "수량", "영수증")):
        return "grocery_receipt"
    return "unknown"


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
    return ParsedReceiptLine(name, quantity, "개", unit_price, total_price, "product", canonical, confidence, reason)


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
    confidence = 0.94 if unit_price is not None and total_price is not None and quantity_candidates else 0.72 if unit_price is not None and total_price is not None else 0.56
    reason = None if confidence >= 0.8 else "OCR observation에서 수량 또는 금액 일부가 확인되지 않았습니다."
    return ParsedReceiptLine(name, quantity, unit, unit_price, total_price, "product", _normalize_product_name(name), confidence, reason)


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
    match = re.search(r"(?:\(|\s)(\d+(?:\.\d+)?)\s*(?:개|팩|입|구|병|캔)\b", name)
    return float(match.group(1)) if match else 1.0


def _unit_from_name(name: str) -> str:
    # Weight/volume (g, kg, ml, L) describes the package, not the purchased
    # count. Keep the API quantity unit count-based until a dedicated weight
    # field is populated from the receipt/label parser.
    match = re.search(r"(?:\d+(?:\.\d+)?)\s*(개|팩|입|구|병|캔)\b", name)
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
