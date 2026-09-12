from pathlib import Path

from app.main import _seed_foods
import app.planner as planner
from app.planner import RecipeIngredient, RecipeSpec, load_recipe_specs, plan_recipe


def test_recipe_fixture_resolves_from_a_container_app_layout(tmp_path: Path) -> None:
    fixture = tmp_path / "data" / "fixtures" / "recipes" / "recipes-v1.json"
    fixture.parent.mkdir(parents=True)
    fixture.write_text("[]", encoding="utf-8")
    module_file = tmp_path / "app" / "planner.py"

    assert planner._resolve_recipe_fixture_path(module_file) == fixture


def test_planner_prefers_a_full_match_and_preserves_inventory_ids() -> None:
    foods = _seed_foods()[:3]
    planned = plan_recipe(foods, 30)

    assert planned is not None
    assert planned.recipe_id == "spinach-tofu-chicken-bowl"
    assert planned.matched_ratio == 1
    assert planned.missing_ingredients == ()
    assert planned.inventory_ids == ("spinach-1", "tofu-1", "chicken-1")
    assert planned.planner_version == "recipe-planner-v2"
    assert planned.source_name == "Rescue Meal 팀 작성 레시피"
    assert planned.license == "project-authored"
    assert planned.source_revision == "recipes-v1"


def test_planner_scales_recipe_amounts_and_allocations_by_requested_servings() -> None:
    food = _seed_foods()[0].model_copy(update={"quantity": 2, "unit": "개"})
    specs = (
        RecipeSpec(
            id="spinach-two-serving",
            title="시금치 요리",
            minutes=10,
            ingredients=(RecipeIngredient(canonical_name="시금치", amount=1, unit="개"),),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    planned = plan_recipe([food], 30, specs=specs, servings=2)

    assert planned is not None
    assert planned.servings == 2
    assert planned.ingredients[0].amount == 2
    assert planned.ingredients[0].available is True
    assert [(item.food_id, item.quantity, item.unit) for item in planned.ingredients[0].allocations] == [("spinach-1", 2, "개")]


def test_planner_keeps_missing_ingredients_explicit_for_larger_servings() -> None:
    food = _seed_foods()[0].model_copy(update={"quantity": 1, "unit": "개"})
    onion = _seed_foods()[0].model_copy(update={"id": "onion-1", "canonical_name": "양파", "display_name": "양파", "quantity": 2, "unit": "개"})
    specs = (
        RecipeSpec(
            id="spinach-two-serving-missing",
            title="시금치 두 인분 요리",
            minutes=10,
            ingredients=(
                RecipeIngredient(canonical_name="시금치", amount=1, unit="개"),
                RecipeIngredient(canonical_name="양파", amount=1, unit="개"),
            ),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    planned = plan_recipe([food, onion], 30, specs=specs, servings=2)

    assert planned is not None
    assert planned.servings == 2
    spinach = next(item for item in planned.ingredients if item.canonical_name == "시금치")
    assert spinach.amount == 2
    assert spinach.available is False
    assert [(item.food_id, item.quantity, item.unit) for item in spinach.allocations] == [("spinach-1", 1, "개")]
    assert planned.missing_ingredients == ("시금치",)


def test_planner_exposes_missing_ingredient_instead_of_inventing_stock() -> None:
    foods = [_seed_foods()[0], _seed_foods()[2]]
    planned = plan_recipe(foods, 30)

    assert planned is not None
    assert planned.recipe_id == "spinach-tofu-chicken-bowl"
    assert planned.inventory_ids == ("spinach-1", "chicken-1")
    assert planned.missing_ingredients == ("국산콩 두부",)
    assert [item.canonical_name for item in planned.ingredients if not item.available] == ["국산콩 두부"]


def test_planner_uses_time_limit_and_returns_no_match_without_foods() -> None:
    assert plan_recipe([], 30) is None
    planned = plan_recipe(_seed_foods(), 10)

    assert planned is not None
    assert planned.recipe_id == "mushroom-egg-stir-fry"
    assert planned.minutes == 10


def test_planner_accepts_curated_product_aliases_without_losing_provenance() -> None:
    seed = _seed_foods()
    foods = [seed[0].model_copy(update={"canonical_name": "국내산 시금치"}), seed[1], seed[2]]
    planned = plan_recipe(foods, 30)

    assert planned is not None
    spinach = next(item for item in planned.ingredients if item.canonical_name == "시금치")
    assert spinach.available is True
    assert spinach.available_food_id == "spinach-1"
    assert spinach.match_type == "alias"


def test_planner_does_not_call_a_short_or_wrong_unit_lot_available() -> None:
    seed = _seed_foods()
    short_tofu = seed[1].model_copy(update={"quantity": 0.5})
    planned = plan_recipe([seed[0], short_tofu, seed[2]], 30)

    assert planned is not None
    tofu = next(item for item in planned.ingredients if item.canonical_name == "국산콩 두부")
    assert tofu.available is False
    assert tofu.available_quantity == 0.5
    assert tofu.available_unit == "모"
    assert planned.missing_ingredients == ("국산콩 두부",)


def test_planner_aggregates_multiple_lots_into_recipe_allocations() -> None:
    seed = _seed_foods()
    first_spinach = seed[0].model_copy(update={"id": "spinach-lot-a", "quantity": 0.5, "priority": 1})
    second_spinach = seed[0].model_copy(update={"id": "spinach-lot-b", "quantity": 0.5, "priority": 2})
    planned = plan_recipe([first_spinach, second_spinach, seed[1], seed[2]], 30)

    assert planned is not None
    spinach = next(item for item in planned.ingredients if item.canonical_name == "시금치")
    assert spinach.available is True
    assert spinach.available_quantity == 1
    assert [(item.food_id, item.quantity, item.unit) for item in spinach.allocations] == [("spinach-lot-a", 0.5, "팩"), ("spinach-lot-b", 0.5, "팩")]
    assert planned.inventory_ids[:2] == ("spinach-lot-a", "spinach-lot-b")


def test_planner_converts_only_metric_mass_and_volume_units() -> None:
    food = _seed_foods()[0].model_copy(update={"quantity": 1, "unit": "kg"})
    specs = (
        RecipeSpec(
            id="spinach-500g",
            title="시금치 500g 요리",
            minutes=10,
            ingredients=(RecipeIngredient(canonical_name="시금치", amount=500, unit="g"),),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )
    planned = plan_recipe([food], 30, specs=specs)

    assert planned is not None
    ingredient = planned.ingredients[0]
    assert ingredient.available_quantity == 1000
    assert ingredient.available_unit == "g"
    assert [(allocation.food_id, allocation.quantity, allocation.unit) for allocation in ingredient.allocations] == [("spinach-1", 0.5, "kg")]


def test_planner_accepts_korean_metric_unit_aliases_and_reports_conversion() -> None:
    food = _seed_foods()[0].model_copy(update={"quantity": 2, "unit": "리터"})
    specs = (
        RecipeSpec(
            id="spinach-500ml",
            title="시금치 500ml 요리",
            minutes=10,
            ingredients=(RecipeIngredient(canonical_name="시금치", amount=500, unit="ml"),),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    planned = plan_recipe([food], 30, specs=specs)

    assert planned is not None
    ingredient = planned.ingredients[0]
    assert ingredient.available is True
    assert ingredient.available_quantity == 2000
    assert ingredient.available_unit == "ml"
    assert ingredient.quantity_match == "converted"
    assert [(allocation.quantity, allocation.unit) for allocation in ingredient.allocations] == [(0.5, "리터")]


def test_planner_reports_incompatible_units_without_inventing_stock() -> None:
    seed = _seed_foods()
    specs = (
        RecipeSpec(
            id="spinach-tofu-unit-check",
            title="시금치 두부 단위 확인",
            minutes=10,
            ingredients=(
                RecipeIngredient(canonical_name="시금치", amount=500, unit="g"),
                RecipeIngredient(canonical_name="국산콩 두부", amount=1, unit="모"),
            ),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    planned = plan_recipe(seed[:2], 30, specs=specs)

    assert planned is not None
    spinach = next(item for item in planned.ingredients if item.canonical_name == "시금치")
    tofu = next(item for item in planned.ingredients if item.canonical_name == "국산콩 두부")
    assert spinach.available is False
    assert spinach.quantity_match == "incompatible"
    assert spinach.available_quantity is None
    assert tofu.available is True
    assert planned.missing_ingredients == ("시금치",)


def test_recipe_fixture_has_source_order_and_required_steps() -> None:
    specs = load_recipe_specs()

    assert len(specs) == 53
    assert specs[0].id == "spinach-tofu-chicken-bowl"
    assert len({recipe.id for recipe in specs}) == 53
    assert {"cabbage-carrot-potato", "kimchi-pork-rice", "shrimp-carrot-fried-rice"}.issubset({recipe.id for recipe in specs})
    assert all(recipe.ingredients and recipe.steps and recipe.safety_note for recipe in specs)
    assert all(ingredient.aliases for recipe in specs for ingredient in recipe.ingredients)
    assert all(recipe.source_name and recipe.license and recipe.source_revision for recipe in specs)


def test_expanded_catalog_can_plan_a_recipe_from_new_pantry_items() -> None:
    seed = _seed_foods()[0]
    foods = [
        seed.model_copy(update={"id": "cabbage-lot", "canonical_name": "양배추", "display_name": "양배추", "quantity": 2, "unit": "줌", "priority": 1}),
        seed.model_copy(update={"id": "carrot-lot", "canonical_name": "당근", "display_name": "당근", "quantity": 1, "unit": "개", "priority": 2}),
        seed.model_copy(update={"id": "potato-lot", "canonical_name": "감자", "display_name": "감자", "quantity": 2, "unit": "개", "priority": 3}),
    ]

    planned = plan_recipe(foods, 30)

    assert planned is not None
    assert planned.recipe_id == "cabbage-carrot-potato"
    assert planned.matched_ratio == 1
    assert planned.missing_ingredients == ()
    assert planned.inventory_ids == ("cabbage-lot", "carrot-lot", "potato-lot")


def test_planner_filters_curated_allergen_recipes() -> None:
    planned = plan_recipe(_seed_foods(), 30, avoid_allergens={"soy"})

    assert planned is not None
    assert planned.allergens is not None
    assert "soy" not in planned.allergens
    soy_recipe = next(recipe for recipe in load_recipe_specs() if recipe.id == "mushroom-onion-soy")
    assert soy_recipe.allergens == ("soy",)


def test_planner_abstains_when_recipe_allergen_metadata_is_unknown() -> None:
    specs = (
        RecipeSpec(
            id="unknown-allergen-recipe",
            title="확인 필요 요리",
            minutes=10,
            ingredients=(RecipeIngredient(canonical_name="시금치", amount=1, unit="팩"),),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    assert plan_recipe([_seed_foods()[0]], 30, specs=specs, avoid_allergens={"soy"}) is None
