from datetime import date
from pathlib import Path

import pytest

from app.pipeline.label_parser import parse_label_text
from app.pipeline.ocr import OcrObservation, _flatten_paddle_result, _normalise_remote_bbox
from app.pipeline.receipt_parser import parse_receipt_observations, parse_receipt_text


_RECEIPT_FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "data" / "fixtures" / "receipts"
_LABEL_FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "data" / "fixtures" / "labels"


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
    assert parsed.template_id == "grocery-mart-v1"
    assert parsed.template_confidence >= 0.9
    assert parsed.merchant_name == "동네마트"
    assert parsed.purchased_at is not None
    assert parsed.purchased_at.date() == date(2025, 10, 24)
    assert [line.line_type for line in parsed.lines] == ["product", "product", "discount", "subtotal"]
    assert parsed.lines[0].canonical_name == "국산콩 두부"
    assert parsed.lines[0].quantity == 1
    assert parsed.lines[1].total_price == 3980
    assert parsed.lines[1].unit == "팩"
    assert parsed.lines[2].total_price == -130


def test_receipt_parser_skips_barcode_and_store_code_rows_before_amounts() -> None:
    parsed = parse_receipt_text(
        """
        판매일: 25-10-24 13:38
        상품명 단가 수량 금액
        001 지리산샘물 500mL 뚜껑(20)
        8809345359390
        2,480 4 9,920
        002 처음처럼(병) 360ml
        8801152135235
        1,450 2 2,900
        $특매할인 -130 2 -260
        """
    )

    products = [line for line in parsed.lines if line.line_type == "product"]

    assert len(products) == 2
    assert products[0].quantity == 4
    assert products[0].unit_price == 2480
    assert products[0].total_price == 9920
    assert products[0].barcode == "08809345359390"
    assert products[1].quantity == 2
    assert products[1].unit == "병"
    assert products[1].total_price == 2900
    assert products[1].barcode == "08801152135235"
    assert parsed.template_id == "retail-beverage-v1"


def test_receipt_parser_keeps_spaced_amount_rows_attached_to_the_product() -> None:
    parsed = parse_receipt_text(
        """
        상품명 단가 수량 금액
        001 토닉워터 250ml
        8801094953003
        750 1 750
        """
    )

    products = [line for line in parsed.lines if line.line_type == "product"]

    assert len(products) == 1
    assert products[0].raw_name == "토닉워터 250ml"
    assert products[0].unit_price == 750
    assert products[0].quantity == 1
    assert products[0].total_price == 750
    assert products[0].barcode == "08801094953003"


def test_sanitized_grocery_receipt_fixture_keeps_ten_product_rows_and_codes_out_of_names() -> None:
    parsed = parse_receipt_text((_RECEIPT_FIXTURE_ROOT / "grocery_mart_sanitized_01.txt").read_text())

    products = [line for line in parsed.lines if line.line_type == "product"]

    assert parsed.kind == "grocery_receipt"
    assert parsed.template_id == "grocery-mart-v1"
    assert parsed.purchased_at is not None and parsed.purchased_at.date() == date(2018, 1, 30)
    assert len(products) == 10
    assert products[0].raw_name == "한라봉 1박스(3kg)"
    assert products[0].quantity == 3
    assert products[0].unit == "박스"
    assert products[0].total_price == 37_500
    assert products[0].barcode is None
    assert products[1].barcode == "08801114167523"
    assert products[-1].raw_name == "맛타리버섯 2팩"
    assert products[-1].unit == "팩"
    assert all("880" not in line.raw_name and "2200" not in line.raw_name for line in products)


@pytest.mark.parametrize(
    ("fixture_name", "expected_kind", "expected_template"),
    [
        ("retail_beverage_sanitized_01.txt", "retail_beverage_receipt", "retail-beverage-v1"),
        ("restaurant_sanitized_01.txt", "restaurant_receipt", "restaurant-card-v1"),
    ],
)
def test_sanitized_receipt_fixtures_preserve_beverage_profile_and_block_restaurant_inventory(
    fixture_name: str,
    expected_kind: str,
    expected_template: str,
) -> None:
    parsed = parse_receipt_text((_RECEIPT_FIXTURE_ROOT / fixture_name).read_text())

    assert parsed.kind == expected_kind
    assert parsed.template_id == expected_template
    if expected_kind == "retail_beverage_receipt":
        assert len([line for line in parsed.lines if line.line_type == "product"]) == 10
        assert any(line.line_type == "discount" for line in parsed.lines)
    else:
        assert any("식당 영수증" in warning for warning in parsed.warnings)
        assert not [line for line in parsed.lines if line.line_type == "product"]


def test_restaurant_receipt_uses_a_non_inventory_template_profile() -> None:
    parsed = parse_receipt_text("영수증\n테이블: 4\n주문담당: 관리자\n메뉴명 김치찌개 1 8,000")

    assert parsed.template_id == "restaurant-card-v1"
    assert parsed.template_confidence == 0.98


def test_merchant_extraction_ignores_address_and_business_metadata() -> None:
    parsed = parse_receipt_text(
        """
        주소: 경기도 파주시 아동동 305-28
        사업자번호: 629-81-00848
        판매일: 2026-09-03
        상품명 수량 금액
        001 시금치 1팩 2,980 1 2,980
        """
    )

    assert parsed.merchant_name is None
    assert all("8809345359390" not in line.raw_name for line in parsed.lines)


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
    assert products[0].barcode == "08801114167523"
    assert products[1].raw_name == "국산콩 두부"
    assert products[0].observation_indices == (0, 1, 2, 4, 3, 5)
    assert products[1].observation_indices == (6, 7, 9, 8, 10)

    weighted = parse_receipt_observations([
        OcrObservation("001 오뚜기 빵가루 200g", 0.95, (0.05, 0.90, 0.3, 0.03)),
        OcrObservation("1", 0.95, (0.63, 0.86, 0.02, 0.02)),
        OcrObservation("1,100", 0.95, (0.44, 0.86, 0.08, 0.02)),
        OcrObservation("1,100", 0.95, (0.72, 0.86, 0.08, 0.02)),
    ])
    assert weighted.lines[0].unit == "개"


def test_local_paddle_bbox_is_normalized_to_the_shared_review_coordinates() -> None:
    result = _flatten_paddle_result(
        [{"res": {"rec_texts": ["시금치"], "rec_scores": [0.93], "rec_boxes": [[10, 20, 30, 60]]}}],
        image_size=(100, 100),
    )

    assert result[0].bbox == (0.1, 0.4, 0.2, 0.4)


def test_local_paddle_bbox_is_clipped_to_the_review_surface() -> None:
    result = _flatten_paddle_result(
        [{"res": {"rec_texts": ["가장자리 상품"], "rec_scores": [0.93], "rec_boxes": [[-10, 20, 90, 80]]}}],
        image_size=(100, 100),
    )

    assert result[0].bbox == (0.0, 0.2, 0.9, 0.6)


def test_remote_bbox_rejects_invisible_or_non_finite_geometry() -> None:
    assert _normalise_remote_bbox([0.1, 0.2, 0.3, 0.4]) == (0.1, 0.2, 0.3, 0.4)
    assert _normalise_remote_bbox([1.2, 0.2, 0.3, 0.4]) is None
    assert _normalise_remote_bbox([0.1, 0.2, 0.0, 0.4]) is None
    assert _normalise_remote_bbox([0.1, 0.2, float("nan"), 0.4]) is None


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


def test_label_parser_keeps_ocr_split_packaging_columns_and_weight_code_unconfirmed() -> None:
    # This mirrors the observation-shaped text returned by the attached
    # produce label: the date headings and the leading variable-weight `2`
    # are separate OCR observations.
    parsed = parse_label_text(
        '채 소 류 [ 국 내 산 ]\n'
        '공(포장)년.월.일 유효 년.월.일 100g당(원) 중 량(g)\n'
        '품번\n'
        '2017.06.28\n'
        'OTHER\n'
        '2\n'
        '"3084901023003\n'
        '세종서부농협 로컬푸드'
    )

    assert parsed.date_candidates[0].kind == "unknown"
    assert parsed.consumption_date_candidate is None
    assert parsed.barcode is None
    assert parsed.requires_review is True
    assert any("소비기한 의미" in warning for warning in parsed.warnings)
    assert any("첫 숫자가 2인 바코드" in warning for warning in parsed.warnings)


def test_label_parser_accepts_explicit_use_by_but_not_a_product_code() -> None:
    parsed = parse_label_text("제품명: 두부\n소비기한 2026.09.02\n냉장 보관\n바코드 8801114167523")

    assert parsed.consumption_date_candidate is not None
    assert parsed.consumption_date_candidate.kind == "use_by"
    assert parsed.consumption_date_candidate.value == date(2026, 9, 2)
    assert parsed.consumption_date_candidate.requires_review is True
    assert parsed.requires_review is True
    assert parsed.barcode == "8801114167523"
    assert parsed.storage_hint == "refrigerated"
    assert parsed.storage_condition_text == "냉장 보관"


def test_label_parser_does_not_treat_lot_embedded_digits_as_a_compact_date() -> None:
    parsed = parse_label_text("제품명: 시금치\nLOT20260902A")

    assert parsed.date_candidates == []
    assert parsed.consumption_date_candidate is None


@pytest.mark.parametrize(
    ("fixture_name", "expected_barcode", "expected_storage"),
    [
        ("produce_ambiguous_sanitized_01.txt", None, "unknown"),
        ("packaged_no_date_sanitized_01.txt", "8801075011678", "frozen"),
    ],
)
def test_sanitized_label_fixtures_keep_missing_or_ambiguous_consumption_dates_unconfirmed(
    fixture_name: str,
    expected_barcode: str | None,
    expected_storage: str,
) -> None:
    parsed = parse_label_text((_LABEL_FIXTURE_ROOT / fixture_name).read_text())

    assert parsed.consumption_date_candidate is None
    assert parsed.barcode == expected_barcode
    assert parsed.storage_hint == expected_storage
    assert parsed.requires_review is True
    assert any("소비기한" in warning or "날짜" in warning for warning in parsed.warnings)
