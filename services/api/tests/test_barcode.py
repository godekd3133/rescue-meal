from datetime import date

from app.barcode import parse_barcode


def test_plain_gtin_is_identification_only() -> None:
    result = parse_barcode("8801114167523")

    assert result.barcode_type == "gtin"
    assert result.gtin == "08801114167523"
    assert result.date_assertions == []
    assert result.requires_review is True
    assert any("소비기한" in warning for warning in result.warnings)


def test_restricted_circulation_code_is_not_global_gtin() -> None:
    result = parse_barcode("2 308490 023003")

    assert result.barcode_type == "restricted_circulation"
    assert result.gtin is None
    assert result.requires_review is True


def test_gs1_ai_17_becomes_a_use_by_candidate_with_source() -> None:
    result = parse_barcode("(01)08801114167523(17)260902(10)LOT-7")

    assert result.barcode_type == "gs1_data_carrier"
    assert result.gtin == "08801114167523"
    assert result.lot == "LOT-7"
    assert result.date_assertions[0].kind == "use_by"
    assert result.date_assertions[0].value == date(2026, 9, 2)
    assert result.date_assertions[0].ai == "gs1_ai_17"
