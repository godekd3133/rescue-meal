from datetime import date

from app.pipeline.label_parser import parse_label_text
from app.pipeline.ocr import OcrObservation
from app.pipeline.receipt_parser import parse_receipt_observations, parse_receipt_text


def test_receipt_parser_groups_amount_row_and_keeps_discount_out_of_stock() -> None:
    parsed = parse_receipt_text(
        """
        (주) 동네마트
        판매일: 25-10-24 13:38
        상품명 단가 수량 금액
        001 국산콩 두부 1모
        2,490 1 2,490
        002 맛타리버섯 2팩
        1,990 2 3,980
        $특매할인 -130 1 -130
        합계 6,340
        """
    )

    assert parsed.kind == "grocery_receipt"
    assert parsed.purchased_at is not None
    assert parsed.purchased_at.date() == date(2025, 10, 24)
    assert [line.line_type for line in parsed.lines] == ["product", "product", "discount", "subtotal"]
    assert parsed.lines[0].canonical_name == "국산콩 두부"
    assert parsed.lines[0].quantity == 1
    assert parsed.lines[1].total_price == 3980
    assert parsed.lines[2].total_price == -130


def test_receipt_observations_group_by_item_anchor_and_bbox_columns() -> None:
    observations = [
        OcrObservation("001", 0.99, (0.05, 0.90, 0.05, 0.02)),
        OcrObservation("시금치 1팩", 0.95, (0.16, 0.88, 0.2, 0.02)),
        OcrObservation("8801114167523", 0.95, (0.14, 0.86, 0.2, 0.02)),
        OcrObservation("1", 0.95, (0.63, 0.84, 0.02, 0.02)),
        OcrObservation("2,980", 0.95, (0.44, 0.84, 0.08, 0.02)),
        OcrObservation("2,980", 0.95, (0.72, 0.84, 0.08, 0.02)),
        OcrObservation("002", 0.99, (0.05, 0.78, 0.05, 0.02)),
        OcrObservation("국산콩 두부", 0.95, (0.16, 0.76, 0.2, 0.02)),
        OcrObservation("2", 0.95, (0.63, 0.74, 0.02, 0.02)),
        OcrObservation("2,490", 0.95, (0.44, 0.74, 0.08, 0.02)),
        OcrObservation("4,980", 0.95, (0.72, 0.74, 0.08, 0.02)),
    ]

    parsed = parse_receipt_observations(observations)
    products = [line for line in parsed.lines if line.line_type == "product"]

    assert len(products) == 2
    assert products[0].raw_name == "시금치"
    assert products[0].quantity == 1
    assert products[0].unit_price == 2980
    assert products[0].total_price == 2980
    assert products[1].raw_name == "국산콩 두부"

    weighted = parse_receipt_observations([
        OcrObservation("001 오뚜기 빵가루 200g", 0.95, (0.05, 0.90, 0.3, 0.03)),
        OcrObservation("1", 0.95, (0.63, 0.86, 0.02, 0.02)),
        OcrObservation("1,100", 0.95, (0.44, 0.86, 0.08, 0.02)),
        OcrObservation("1,100", 0.95, (0.72, 0.86, 0.08, 0.02)),
    ])
    assert weighted.lines[0].unit == "개"


def test_restaurant_receipt_is_classified_separately() -> None:
    parsed = parse_receipt_text("영수증\n테이블: 4\n주문담당: 관리자\n메뉴명 김치찌개 1 8,000")

    assert parsed.kind == "restaurant_receipt"
    assert any("식당 영수증" in warning for warning in parsed.warnings)


def test_label_parser_requires_review_when_adjacent_date_columns_are_ambiguous() -> None:
    parsed = parse_label_text(
        "제품명: 채소류 [국내산]\n(포장)년.월.일   유효 년.월.일\n2017.06.28\n중량 2300g\n2 308490 023003"
    )

    assert parsed.date_candidates
    assert parsed.date_candidates[0].value == date(2017, 6, 28)
    assert parsed.date_candidates[0].kind == "unknown"
    assert parsed.consumption_date_candidate is None
    assert parsed.requires_review is True
    assert parsed.barcode is None
    assert any("첫 숫자가 2인 바코드" in warning for warning in parsed.warnings)

    split_barcode = parse_label_text("제품명: 채소류\n중량 2300g\n2\n308490 023003")
    assert split_barcode.barcode is None


def test_label_parser_accepts_explicit_use_by_but_not_a_product_code() -> None:
    parsed = parse_label_text("제품명: 두부\n소비기한 2026.09.02\n바코드 8801114167523")

    assert parsed.consumption_date_candidate is not None
    assert parsed.consumption_date_candidate.kind == "use_by"
    assert parsed.consumption_date_candidate.value == date(2026, 9, 2)
    assert parsed.consumption_date_candidate.requires_review is True
    assert parsed.barcode == "8801114167523"
