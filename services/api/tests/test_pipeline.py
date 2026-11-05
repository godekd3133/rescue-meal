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
    # Package size stays in the raw name (as in the text path); the canonical
    # name drops it.
    assert products[0].raw_name == "시금치 1팩"
    assert products[0].canonical_name == "시금치"
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


def _obs(text: str, x: float, y: float, w: float = 0.1, h: float = 0.05) -> OcrObservation:
    return OcrObservation(text, 0.95, (x, y, w, h))


def test_receipt_observations_keep_the_table_header_out_of_the_first_product_name() -> None:
    # Benchmark e2e `retail_beverage_sanitized_01`: the header box sits within
    # the name-pull distance of the first item and used to prefix its name.
    parsed = parse_receipt_observations([
        _obs("상품명 단가 수량 금액", 0.076, 0.890, 0.289, 0.022),
        _obs("001지리산샘물 500mL뚜껑(20)", 0.077, 0.865, 0.441, 0.022),
        _obs("8809345359390", 0.077, 0.844, 0.241, 0.019),
        _obs("2,480", 0.484, 0.816, 0.091, 0.020),
        _obs("4", 0.683, 0.816, 0.026, 0.016),
        _obs("9,920", 0.852, 0.812, 0.088, 0.021),
    ])

    product = parsed.lines[0]
    assert product.raw_name == "지리산샘물 500mL뚜껑(20)"
    assert "상품명" not in product.raw_name
    assert (product.unit_price, product.quantity, product.total_price) == (2480, 4, 9920)
    assert product.review_reason is None


def test_receipt_observations_keep_can_and_volume_in_the_name() -> None:
    parsed = parse_receipt_observations([
        _obs("007삿포로/캔500m", 0.059, 0.366, 0.296, 0.020),
        _obs("4901880851446", 0.058, 0.342, 0.233, 0.019),
        _obs("2,150", 0.473, 0.314, 0.083, 0.020),
        _obs("1", 0.668, 0.314, 0.025, 0.016),
        _obs("2,150", 0.840, 0.312, 0.081, 0.019),
        _obs("$특매할인", 0.051, 0.293, 0.143, 0.022),
        _obs("-260", 0.474, 0.291, 0.080, 0.020),
        _obs("1", 0.667, 0.292, 0.026, 0.015),
        _obs("-260", 0.843, 0.289, 0.077, 0.019),
    ])

    assert [line.line_type for line in parsed.lines] == ["product", "discount"]
    assert parsed.lines[0].raw_name == "삿포로/캔500m"
    assert parsed.lines[0].quantity == 1
    # The discount row's own numbers stay with the discount line.
    assert parsed.lines[1].total_price == -260


def test_receipt_observations_attach_amounts_from_the_same_visual_row() -> None:
    # Benchmark e2e `syn_inline_amount_01`: the quantity box is a little
    # higher than the name box, so a plain y sort pulled the next row's
    # amounts into the previous product without a review flag.
    parsed = parse_receipt_observations([
        _obs("상품명 단가 수량 금액", 0.052, 0.771, 0.294, 0.047),
        _obs("001바른계란10구", 0.048, 0.705, 0.259, 0.051),
        _obs("4,980", 0.471, 0.705, 0.092, 0.051),
        _obs("1", 0.678, 0.708, 0.028, 0.047),
        _obs("4,980", 0.848, 0.704, 0.095, 0.057),
        _obs("002햇양파1.5kg", 0.047, 0.638, 0.245, 0.057),
        _obs("3,500", 0.468, 0.639, 0.097, 0.056),
        _obs("1", 0.676, 0.643, 0.035, 0.049),
        _obs("3,500", 0.848, 0.642, 0.097, 0.053),
        _obs("003 냉동만두1kg", 0.046, 0.573, 0.252, 0.057),
        _obs("6,900", 0.468, 0.575, 0.096, 0.056),
        _obs("2", 0.675, 0.577, 0.029, 0.049),
        _obs("13,800", 0.836, 0.578, 0.107, 0.051),
        _obs("할인-1,000", 0.045, 0.509, 0.171, 0.056),
        _obs("합계22,280", 0.045, 0.445, 0.176, 0.052),
        _obs("감사합니다 다음에 또 오세요", 0.045, 0.380, 0.4, 0.052),
    ])

    products = [line for line in parsed.lines if line.line_type == "product"]
    assert [(line.raw_name, line.quantity, line.unit_price, line.total_price) for line in products] == [
        ("바른계란10구", 1, 4980, 4980),
        ("햇양파1.5kg", 1, 3500, 3500),
        ("냉동만두1kg", 2, 6900, 13800),
    ]
    assert all(line.review_reason is None for line in products)
    # Footer text after 합계 must not leak into the last product.
    assert [line.line_type for line in parsed.lines][-2:] == ["discount", "subtotal"]


def test_receipt_observations_repair_period_thousands_separator_but_require_review() -> None:
    # Benchmark e2e `syn_ocr_noise_01`: `2.500` was read as 500 won.
    parsed = parse_receipt_observations([
        _obs("001국산콩 두 부 300g", 0.048, 0.705, 0.323, 0.055),
        _obs("8800000000017", 0.047, 0.647, 0.266, 0.046),
        _obs("2.500", 0.468, 0.576, 0.097, 0.056),
        _obs("1", 0.679, 0.577, 0.028, 0.046),
        _obs("2.500", 0.847, 0.576, 0.096, 0.055),
    ])

    product = parsed.lines[0]
    assert (product.unit_price, product.total_price) == (2500, 2500)
    assert product.review_reason is not None
    assert product.match_confidence < 0.8


@pytest.mark.parametrize(
    ("unit_price", "quantity", "total_price"),
    [("2,980", "1", "5,980"), ("12,500", "2", "37,500")],
)
def test_receipt_observations_flag_amounts_that_do_not_multiply(unit_price: str, quantity: str, total_price: str) -> None:
    parsed = parse_receipt_observations([
        _obs("001 시금치 1단", 0.05, 0.80, 0.3, 0.03),
        _obs(unit_price, 0.47, 0.75, 0.09, 0.03),
        _obs(quantity, 0.67, 0.75, 0.02, 0.03),
        _obs(total_price, 0.84, 0.75, 0.09, 0.03),
    ])

    assert parsed.lines[0].review_reason is not None
    assert any("확인" in warning for warning in parsed.warnings)


def test_receipt_observations_flag_conflicting_amount_candidates() -> None:
    parsed = parse_receipt_observations([
        _obs("001 시금치 1단", 0.05, 0.80, 0.3, 0.03),
        _obs("1,980", 0.47, 0.75, 0.09, 0.03),
        _obs("1", 0.67, 0.75, 0.02, 0.03),
        _obs("1,980", 0.84, 0.75, 0.09, 0.03),
        _obs("2,480", 0.84, 0.70, 0.09, 0.03),
    ])

    assert parsed.lines[0].review_reason is not None


def test_receipt_observations_infer_a_missing_quantity_only_from_consistent_amounts() -> None:
    parsed = parse_receipt_observations([
        _obs("001 맛타리버섯 2팩", 0.05, 0.80, 0.3, 0.03),
        _obs("1,000", 0.47, 0.75, 0.09, 0.03),
        _obs("1,000", 0.84, 0.75, 0.09, 0.03),
    ])

    assert parsed.lines[0].quantity == 1
    assert parsed.lines[0].review_reason is None

    unresolved = parse_receipt_observations([
        _obs("001 맛타리버섯 2팩", 0.05, 0.80, 0.3, 0.03),
        _obs("1,000", 0.47, 0.75, 0.09, 0.03),
        _obs("1,500", 0.84, 0.75, 0.09, 0.03),
    ])
    assert unresolved.lines[0].review_reason is not None


def test_receipt_text_repairs_ocr_lookalike_amounts_with_review() -> None:
    parsed = parse_receipt_text(
        "판매일: 26-11-03 10:11\n상품명 단가 수량 금액\n"
        "001 국산콩 두 부 300g\n8800000000017\n2.500 1 2.500\n"
        "002 시금치 1단\n201344\n1,980 l 1,980\n"
        "003 무항생제 닭가슴살 1kg\n8800000000024\n8,9OO 1 8,9OO"
    )

    products = [line for line in parsed.lines if line.line_type == "product"]
    assert [(line.raw_name, line.quantity, line.total_price) for line in products] == [
        ("국산콩 두 부 300g", 1, 2500),
        ("시금치 1단", 1, 1980),
        ("무항생제 닭가슴살 1kg", 1, 8900),
    ]
    assert all(line.review_reason for line in products)
    assert any("확인" in warning for warning in parsed.warnings)


def test_receipt_text_flags_a_numbered_row_whose_amounts_do_not_multiply() -> None:
    parsed = parse_receipt_text("001 시금치 1단 1,980 2 1,980")

    assert parsed.lines[0].review_reason is not None
    assert parsed.lines[0].match_confidence < 0.8


def test_receipt_text_reads_rows_without_item_numbers_and_branch_merchant_names() -> None:
    parsed = parse_receipt_text(
        "행복마트 성수점\n2026-11-01 13:05\n상품명 단가 수량 금액\n"
        "서울목장 우유 1L 2,500 1 2,500\n국산콩 두부 300g 1,200 2 2,400\n대파 1단 2,980 1 2,980\n"
        "합계 7,880\n카드결제 7,880"
    )

    assert parsed.merchant_name == "행복마트 성수점"
    products = [line for line in parsed.lines if line.line_type == "product"]
    assert [(line.raw_name, line.quantity, line.total_price) for line in products] == [
        ("서울목장 우유 1L", 1, 2500),
        ("국산콩 두부 300g", 2, 2400),
        ("대파 1단", 1, 2980),
    ]


@pytest.mark.parametrize(
    "line",
    ["TEL 02 123 4567", "과세물품 7,164 716 7,880", "상품명 단가 수량 금액", "판매일 2026 11 01", "2,500 1 2,500"],
)
def test_receipt_text_does_not_invent_unnumbered_products(line: str) -> None:
    parsed = parse_receipt_text(f"행복마트\n{line}")

    assert not [item for item in parsed.lines if item.line_type == "product"]


def test_receipt_observations_without_item_numbers_rebuild_rows() -> None:
    # Benchmark e2e `syn_no_item_number_01`: used to yield three empty names.
    parsed = parse_receipt_observations([
        _obs("행복마트 성수점", 0.054, 0.900, 0.219, 0.054),
        _obs("2026-11-0113:05", 0.054, 0.840, 0.251, 0.047),
        _obs("상품명 단가 수량 금액", 0.052, 0.773, 0.295, 0.051),
        _obs("서울목장 우유 1L", 0.052, 0.706, 0.229, 0.056),
        _obs("2,500", 0.470, 0.702, 0.093, 0.054),
        _obs("1", 0.679, 0.705, 0.031, 0.046),
        _obs("2,500", 0.848, 0.700, 0.092, 0.051),
        _obs("대파1단", 0.050, 0.578, 0.118, 0.059),
        _obs("2,980", 0.471, 0.575, 0.093, 0.054),
        _obs("1", 0.679, 0.577, 0.030, 0.044),
        _obs("2,980", 0.848, 0.570, 0.093, 0.056),
        _obs("합계5,480", 0.052, 0.519, 0.154, 0.049),
    ])

    assert parsed.merchant_name == "행복마트 성수점"
    products = [line for line in parsed.lines if line.line_type == "product"]
    assert [(line.raw_name, line.total_price) for line in products] == [("서울목장 우유 1L", 2500), ("대파1단", 2980)]


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
    "text",
    [
        "소비기한: 뚜껑 별도 표기일까지\nLOT 20261015\n실온보관",
        "소비기한 별도 표기\n제조번호: 20261015",
        "소비기한 뚜껑 표기\nLOT\n20261015",
        "소비기한 하단 표기\nLot No. 2026.10.15",
    ],
)
def test_label_parser_never_offers_a_lot_number_near_a_use_by_keyword_as_a_date(text: str) -> None:
    # Benchmark probe `lot_number_near_keyword_01`: the LOT was read as a
    # use_by date with confidence 0.94 — the most dangerous failure mode.
    parsed = parse_label_text(text)

    assert parsed.date_candidates == []
    assert parsed.consumption_date_candidate is None
    assert parsed.requires_review is True
    assert any("제조번호(LOT)" in warning for warning in parsed.warnings)


def test_label_parser_keeps_a_real_use_by_date_next_to_a_lot_number() -> None:
    parsed = parse_label_text("LOT 20261015\n소비기한 2026.12.01\n냉장보관")

    assert [(candidate.kind, candidate.value) for candidate in parsed.date_candidates] == [("use_by", date(2026, 12, 1))]


def test_label_parser_never_trusts_an_unlabelled_compact_date_shape() -> None:
    parsed = parse_label_text("소비기한 뚜껑 표기\n20261015")

    assert parsed.consumption_date_candidate is not None
    assert parsed.consumption_date_candidate.confidence < 0.8


def test_label_parser_classifies_adjacent_production_and_use_by_lines() -> None:
    parsed = parse_label_text("제품명: 가상 요거트\n제조일 2026.10.25\n소비기한 2026.11.08\n0~10℃ 냉장보관")

    assert [(candidate.kind, candidate.value) for candidate in parsed.date_candidates] == [
        ("production_date", date(2026, 10, 25)),
        ("use_by", date(2026, 11, 8)),
    ]
    assert parsed.consumption_date_candidate is not None
    assert parsed.consumption_date_candidate.value == date(2026, 11, 8)
    assert parsed.consumption_date_candidate.requires_review is True


def test_label_parser_classifies_two_labelled_dates_on_one_line() -> None:
    parsed = parse_label_text("유통기한 2026.11.20 제조일 2026.10.20\n냉동보관 -18℃ 이하")

    assert [(candidate.kind, candidate.value) for candidate in parsed.date_candidates] == [
        ("sell_by", date(2026, 11, 20)),
        ("production_date", date(2026, 10, 20)),
    ]
    assert parsed.consumption_date_candidate is not None
    assert parsed.consumption_date_candidate.kind == "sell_by"


@pytest.mark.parametrize(
    "text",
    [
        # The only keyword labels the *other* value on the line.
        "2026.11.20 제조일 2026.10.20",
        # Column headings without x-coordinates.
        "제조일  소비기한\n2026.10.25  2026.11.08",
    ],
)
def test_label_parser_abstains_when_a_keyword_could_belong_to_another_value(text: str) -> None:
    parsed = parse_label_text(text)

    assert parsed.consumption_date_candidate is None
    assert parsed.date_candidates[0].kind == "unknown"


def test_label_parser_reads_two_digit_years_without_trusting_them() -> None:
    parsed = parse_label_text("소비기한: 26.11.20\n냉장보관")

    assert parsed.consumption_date_candidate is not None
    assert parsed.consumption_date_candidate.kind == "use_by"
    assert parsed.consumption_date_candidate.value == date(2026, 11, 20)
    # `26.11.20` is also a valid DD.MM.YY date, so it is never confident.
    assert parsed.consumption_date_candidate.confidence < 0.8
    assert any("연도가 두 자리" in warning for warning in parsed.warnings)


@pytest.mark.parametrize("text", ["단가 2.500원", "중량 1.5kg", "전화 02-123-4567", "1.2.3", "26.13.40"])
def test_label_parser_two_digit_year_does_not_match_prices_or_codes(text: str) -> None:
    assert parse_label_text(text).date_candidates == []


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
