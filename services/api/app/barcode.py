from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal


BarcodeType = Literal["gtin", "gs1_data_carrier", "restricted_circulation", "unknown"]
Gs1DateKind = Literal["production_date", "packaging_date", "best_before", "sell_by", "use_by"]


@dataclass(frozen=True)
class BarcodeDateAssertion:
    kind: Gs1DateKind
    value: date
    ai: str
    confidence: float = 1.0


@dataclass(frozen=True)
class ParsedBarcode:
    raw_scan: str
    barcode_type: BarcodeType
    gtin: str | None
    lot: str | None
    date_assertions: list[BarcodeDateAssertion]
    warnings: list[str]
    requires_review: bool


_DATE_AI: dict[str, Gs1DateKind] = {
    "11": "production_date",
    "13": "packaging_date",
    "15": "best_before",
    "16": "sell_by",
    "17": "use_by",
}


def parse_barcode(raw_scan: str) -> ParsedBarcode:
    raw = raw_scan.strip()
    if not raw:
        return ParsedBarcode(raw, "unknown", None, None, [], ["바코드 값이 비어 있습니다."], True)

    if raw.startswith(("https://id.gs1.org/", "http://id.gs1.org/")):
        return _parse_gs1_digital_link(raw)

    if "(" in raw:
        return _parse_parenthesized_gs1(raw)

    if raw.startswith("]d2") or "\x1d" in raw:
        return _parse_gs1_element_string(raw)

    compact = re.sub(r"[\s-]", "", raw)
    if compact.isdigit() and 8 <= len(compact) <= 14:
        if compact.startswith("2"):
            return ParsedBarcode(
                raw,
                "restricted_circulation",
                None,
                None,
                [],
                ["첫 숫자가 2인 코드는 가변중량 또는 매장용 코드일 수 있어 글로벌 GTIN으로 확정하지 않습니다."],
                True,
            )
        if len(compact) in {8, 12, 13, 14}:
            return ParsedBarcode(raw, "gtin", compact.zfill(14), None, [], ["일반 GTIN은 상품 식별값이며 소비기한을 포함하지 않습니다."], True)
    return ParsedBarcode(raw, "unknown", None, None, [], ["지원하지 않는 바코드 형식입니다."], True)


def _parse_parenthesized_gs1(raw: str) -> ParsedBarcode:
    fields = {match.group(1): match.group(2).strip() for match in re.finditer(r"\((\d{2,4})\)([^()]+)", raw)}
    return _build_gs1_result(raw, fields)


def _parse_gs1_element_string(raw: str) -> ParsedBarcode:
    encoded = raw[3:] if raw.startswith("]d2") else raw
    fields: dict[str, str] = {}
    warnings: list[str] = []
    fixed_lengths = {"01": 14, "11": 6, "13": 6, "15": 6, "16": 6, "17": 6}
    known_ais = tuple((*fixed_lengths.keys(), "10"))
    cursor = 0
    while cursor < len(encoded):
        if encoded[cursor] == "\x1d":
            cursor += 1
            continue
        ai = next((candidate for candidate in known_ais if encoded.startswith(candidate, cursor)), None)
        if ai is None:
            warnings.append("GS1 element string에서 지원하지 않는 AI를 만났습니다.")
            break
        cursor += len(ai)
        if ai in fixed_lengths:
            end = cursor + fixed_lengths[ai]
            if end > len(encoded):
                warnings.append(f"GS1 AI {ai} 값의 길이가 부족합니다.")
                break
            fields[ai] = encoded[cursor:end].strip()
            cursor = end
            continue
        end = encoded.find("\x1d", cursor)
        if end == -1:
            end = len(encoded)
        fields[ai] = encoded[cursor:end].strip()
        cursor = end
    return _build_gs1_result(raw, fields, warnings)


def _parse_gs1_digital_link(raw: str) -> ParsedBarcode:
    fields = {
        match.group(1): match.group(2).strip()
        for match in re.finditer(r"/(01|10|11|13|15|16|17)/([^/?#]+)", raw)
    }
    warnings = [] if fields else ["GS1 Digital Link에서 상품 식별 field를 찾지 못했습니다."]
    return _build_gs1_result(raw, fields, warnings)


def _build_gs1_result(raw: str, fields: dict[str, str], initial_warnings: list[str] | None = None) -> ParsedBarcode:
    warnings: list[str] = list(initial_warnings or [])
    assertions: list[BarcodeDateAssertion] = []
    for ai, kind in _DATE_AI.items():
        value = fields.get(ai)
        if not value:
            continue
        parsed_date = _parse_yymmdd(value)
        if parsed_date is None:
            warnings.append(f"GS1 AI {ai} 날짜를 해석하지 못했습니다.")
            continue
        assertions.append(BarcodeDateAssertion(kind, parsed_date, f"gs1_ai_{ai}"))
    gtin = fields.get("01")
    lot = fields.get("10")
    if gtin and not gtin.isdigit():
        warnings.append("GS1 AI 01 값이 숫자가 아니어서 GTIN으로 확정하지 않습니다.")
        gtin = None
    if gtin and len(gtin) != 14:
        warnings.append("GS1 AI 01 값의 길이가 14자리가 아니어서 review가 필요합니다.")
    if not assertions:
        warnings.append("GS1 상품 코드에서 날짜 AI를 찾지 못했습니다.")
    return ParsedBarcode(raw, "gs1_data_carrier", gtin, lot, assertions, warnings, True)


def _parse_yymmdd(value: str) -> date | None:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 6:
        return None
    try:
        return date(2000 + int(digits[:2]), int(digits[2:4]), int(digits[4:6]))
    except ValueError:
        return None
