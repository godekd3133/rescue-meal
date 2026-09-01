from app.main import _seed_foods
from app.planner import RecipeIngredient, RecipeSpec, load_recipe_specs, plan_recipe


def test_planner_prefers_a_full_match_and_preserves_inventory_ids() -> None:
    foods = _seed_foods()[:3]
    planned = plan_recipe(foods, 30)

    assert planned is not None
    assert planned.recipe_id == "spinach-tofu-chicken-bowl"
    assert planned.matched_ratio == 1
    assert planned.missing_ingredients == ()
    assert planned.inventory_ids == ("spinach-1", "tofu-1", "chicken-1")
    assert planned.planner_version == "recipe-planner-v2"


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


def test_recipe_fixture_has_source_order_and_required_steps() -> None:
    specs = load_recipe_specs()

    assert len(specs) == 5
    assert specs[0].id == "spinach-tofu-chicken-bowl"
    assert all(recipe.ingredients and recipe.steps and recipe.safety_note for recipe in specs)
    assert all(ingredient.aliases for recipe in specs for ingredient in recipe.ingredients)
