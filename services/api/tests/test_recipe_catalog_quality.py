"""Cookability, pantry-staple and frozen-lot contracts for the recipes-v1 catalog."""

from dataclasses import dataclass

from fastapi.testclient import TestClient
import pytest

import app.main as main_module
import app.planner as planner
from app.main import _seed_foods, app, store
from app.meal_optimizer import optimize_multi_day_plans
from app.planner import (
    DEFAULT_THAW_MINUTES,
    PantryItem,
    RecipeIngredient,
    RecipeSpec,
    _curated_allergens,
    _name_key,
    load_recipe_specs,
    plan_recipe,
)


client = TestClient(app)

STAPLE_NAMES = {"밥", "간장", "국간장", "소금", "식용유", "설탕", "참기름", "고춧가루", "고추장", "된장", "후추", "다진 마늘", "물"}
HEAT_WORDS = ("강불", "중불", "약불", "중약불", "전자레인지")


@pytest.fixture(autouse=True)
def reset_store():
    store.reset()
    yield
    store.reset()


@dataclass(frozen=True)
class Lot:
    id: str
    canonical_name: str
    priority: int
    quantity: float
    unit: str
    storage_type: str = "refrigerated"


def test_every_catalog_recipe_has_cookable_structured_steps() -> None:
    specs = load_recipe_specs()

    assert len(specs) == 53
    for recipe in specs:
        assert 4 <= len(recipe.step_details) <= 7, recipe.id
        assert recipe.steps == tuple(step.text for step in recipe.step_details), recipe.id
        assert {step.stage for step in recipe.step_details} <= {"손질", "조리", "마무리"}, recipe.id
        assert recipe.step_details[-1].stage == "마무리", recipe.id
        assert all(step.minutes is not None and step.minutes >= 1 for step in recipe.step_details), recipe.id
        assert sum(step.minutes for step in recipe.step_details) <= recipe.minutes, recipe.id
        # Date/status checks live in safety_note only, never as a cooking step.
        assert not any("날짜" in step.text or "소비기한" in step.text for step in recipe.step_details), recipe.id
        assert any(step.heat for step in recipe.step_details) or recipe.id in {
            "tomato-tuna-cucumber",
            "chickpea-cabbage-salad",
        }, recipe.id
        for step in recipe.step_details:
            if step.heat:
                assert step.heat in HEAT_WORDS, (recipe.id, step.heat)
                assert step.heat in step.text, (recipe.id, step.text)
        assert recipe.pantry, recipe.id
        assert recipe.safety_note, recipe.id


def test_staples_live_in_pantry_and_never_in_matched_ingredients() -> None:
    for recipe in load_recipe_specs():
        ingredient_keys = {_name_key(ingredient.canonical_name) for ingredient in recipe.ingredients}
        assert not ingredient_keys & {_name_key(name) for name in STAPLE_NAMES}, recipe.id
        assert len({item.name for item in recipe.pantry}) == len(recipe.pantry), recipe.id


def test_declared_allergens_cover_ingredients_and_pantry_seasonings() -> None:
    for recipe in load_recipe_specs():
        assert recipe.allergens is not None, recipe.id
        derived = set(_curated_allergens(recipe.ingredients, pantry=recipe.pantry))
        assert derived <= set(recipe.allergens), recipe.id
        if any(item.name in {"간장", "국간장", "고추장", "된장"} for item in recipe.pantry):
            assert {"soy", "wheat"} <= set(recipe.allergens), recipe.id
        if any(item.name == "버터" for item in recipe.pantry):
            assert "milk" in recipe.allergens, recipe.id
    yogurt = next(recipe for recipe in load_recipe_specs() if recipe.id == "sweet-potato-yogurt-bowl")
    assert "milk" in yogurt.allergens
    curry = next(recipe for recipe in load_recipe_specs() if recipe.id == "beef-potato-curry")
    assert {"wheat", "milk", "soy"} <= set(curry.allergens)


def test_spaghetti_and_korean_adverbs_do_not_imply_shellfish() -> None:
    ingredients = (RecipeIngredient("파스타면", 1, "인분", ("스파게티면",)),)
    allergens = _curated_allergens(ingredients, steps=("면을 얇게 펴고 노릇하게 굽습니다.",))
    assert "shellfish" not in allergens
    assert "wheat" in allergens
    assert "shellfish" in _curated_allergens((RecipeIngredient("오징어", 1, "마리"),))


def test_pantry_allergens_apply_to_recipes_without_declared_allergens() -> None:
    spec = planner._recipe_spec_from_dict({
        "id": "draft-like",
        "title": "버섯볶음",
        "minutes": 10,
        "ingredients": [{"canonical_name": "버섯", "amount": 1, "unit": "팩"}],
        "pantry": [{"name": "간장", "amount": 1, "unit": "큰술"}],
        "steps": ["볶습니다."],
        "safety_note": "상태를 확인하세요.",
    })
    assert spec.allergens == ("soy", "wheat")
    assert spec.step_details == ()


def test_pantry_items_are_reported_but_never_missing_or_allocated() -> None:
    foods = [
        Lot("tofu-lot", "국산콩 두부", 1, 1, "모"),
        Lot("kimchi-lot", "김치", 2, 1, "컵"),
    ]
    planned = plan_recipe(foods, 30, preferred_recipe_id="tofu-kimchi-rice", servings=2)

    assert planned is not None
    assert [ingredient.canonical_name for ingredient in planned.ingredients] == ["국산콩 두부", "김치"]
    assert planned.missing_ingredients == ("김치",)  # 1컵 x 2인분 > 1컵 재고
    pantry = {item.name: item for item in planned.pantry}
    assert pantry["밥"].amount == 2 and pantry["밥"].unit == "공기"
    assert pantry["간장"].amount == 1.0
    assert pantry["고춧가루"].optional is True
    assert planned.inventory_ids == ("tofu-lot", "kimchi-lot")


def test_shopping_list_from_a_plan_never_contains_pantry_staples() -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", "chicken-1"],
            "max_minutes": 30,
            "recipe_id": "spinach-tofu-chicken-bowl",
            "plan_id": "meal-pantry-shopping-1",
        },
    )
    assert saved.status_code == 200
    payload = saved.json()
    assert {item["name"] for item in payload["pantry_items"]} >= {"밥", "간장", "식용유", "참기름"}
    assert payload["missing_ingredients"] == ["국산콩 두부"]

    added = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-pantry-shopping-1"})
    assert added.status_code == 200
    names = {item["canonical_name"] for item in added.json()["items"]}
    assert names == {"국산콩 두부"}
    assert not names & STAPLE_NAMES


def test_frozen_lot_adds_quick_thaw_time_and_a_thaw_step() -> None:
    recipe = next(recipe for recipe in load_recipe_specs() if recipe.id == "spinach-tofu-chicken-bowl")
    foods = _seed_foods()[:3]  # chicken-1 is stored frozen
    assert foods[2].storage_type == "frozen"

    assert plan_recipe(foods, recipe.minutes, specs=(recipe,)) is None
    planned = plan_recipe(foods, recipe.minutes + DEFAULT_THAW_MINUTES, specs=(recipe,))

    assert planned is not None
    assert planned.minutes == recipe.minutes
    assert planned.thaw_minutes == DEFAULT_THAW_MINUTES
    assert planned.total_minutes == recipe.minutes + DEFAULT_THAW_MINUTES
    assert planned.frozen_food_ids == ("chicken-1",)
    assert planned.thaw_food_ids == ("chicken-1",)
    assert planned.step_details[0].stage == "해동"
    assert planned.step_details[0].minutes == DEFAULT_THAW_MINUTES
    assert "닭가슴살" in planned.steps[0] and "포장지의 해동 안내" in planned.steps[0]
    assert planned.steps[1:] == recipe.steps
    assert len(planned.step_details) == len(recipe.step_details) + 1


def test_refrigerated_lot_is_preferred_over_a_frozen_lot_of_the_same_ingredient() -> None:
    recipe = next(recipe for recipe in load_recipe_specs() if recipe.id == "chicken-cabbage-onion")
    foods = [
        Lot("chicken-frozen", "닭가슴살", 1, 1, "팩", "frozen"),
        Lot("chicken-fridge", "닭가슴살", 2, 1, "팩", "refrigerated"),
        Lot("cabbage", "양배추", 3, 2, "줌"),
        Lot("onion", "양파", 4, 1, "개"),
    ]

    planned = plan_recipe(foods, recipe.minutes, specs=(recipe,))

    assert planned is not None
    chicken = next(item for item in planned.ingredients if item.canonical_name == "닭가슴살")
    assert [allocation.food_id for allocation in chicken.allocations] == ["chicken-fridge"]
    assert planned.thaw_minutes == 0
    assert planned.frozen_food_ids == ()
    assert planned.total_minutes == recipe.minutes
    assert planned.steps == recipe.steps


def test_frozen_vegetable_that_cooks_from_frozen_adds_no_time() -> None:
    recipe = next(recipe for recipe in load_recipe_specs() if recipe.id == "spinach-mushroom-tofu-soup")
    foods = [
        Lot("spinach-frozen", "시금치", 1, 1, "팩", "frozen"),
        Lot("mushroom", "맛타리버섯", 2, 1, "팩"),
        Lot("tofu", "국산콩 두부", 3, 1, "모"),
    ]

    planned = plan_recipe(foods, recipe.minutes, specs=(recipe,))

    assert planned is not None
    assert planned.frozen_food_ids == ("spinach-frozen",)
    assert planned.thaw_food_ids == ()
    assert planned.thaw_minutes == 0
    assert planned.total_minutes == recipe.minutes
    assert planned.step_details[0].stage == "해동"
    assert "얼린 채로" in planned.steps[0]


def test_frozen_lot_without_structured_steps_still_gets_a_thaw_step() -> None:
    spec = RecipeSpec(
        id="plain", title="닭 요리", minutes=10,
        ingredients=(RecipeIngredient("닭가슴살", 1, "팩"),),
        steps=("굽습니다.",), safety_note="상태를 확인하세요.", allergens=(),
        pantry=(PantryItem("소금", None, "약간"),),
    )
    planned = plan_recipe([Lot("c", "닭가슴살", 1, 1, "팩", "frozen")], 20, specs=(spec,))

    assert planned is not None
    assert [step.stage for step in planned.step_details] == ["해동", "조리"]
    assert planned.steps[1] == "굽습니다."
    assert planned.total_minutes == 20


def test_preview_response_exposes_thaw_and_pantry_fields_and_keeps_strict_limit() -> None:
    for max_minutes in (10, 15, 20, 25, 30):
        response = client.post(
            "/api/meal-plans/preview",
            json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "max_minutes": max_minutes},
        )
        assert response.status_code == 200
        payload = response.json()
        if payload["recipe_id"] == "no-match":
            continue
        assert payload["total_minutes"] <= max_minutes
        assert payload["total_minutes"] == payload["minutes"] + payload["thaw_minutes"]
        assert payload["thaw_required"] is bool(payload["thaw_food_ids"])
        if "chicken-1" in payload["inventory_ids"]:
            assert payload["thaw_required"] is True
            assert payload["thaw_food_ids"] == ["chicken-1"]
            assert payload["step_details"][0]["stage"] == "해동"
            assert payload["steps"][0] == payload["step_details"][0]["text"]
        assert payload["pantry_items"]
        assert all(set(item) == {"name", "amount", "unit", "optional"} for item in payload["pantry_items"])

    preview = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "max_minutes": 30, "recipe_id": "spinach-tofu-chicken-bowl"},
    ).json()
    assert preview["recipe_id"] == "spinach-tofu-chicken-bowl"
    assert preview["thaw_minutes"] == DEFAULT_THAW_MINUTES
    assert preview["total_minutes"] == 25


def test_preview_time_recovery_counts_thaw_minutes(monkeypatch) -> None:
    recipe = next(recipe for recipe in load_recipe_specs() if recipe.id == "spinach-tofu-chicken-bowl")
    monkeypatch.setattr(main_module, "load_recipe_specs", lambda: (recipe,))

    payload = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "max_minutes": 20},
    ).json()

    assert payload["recipe_id"] == "no-match"
    assert payload["recovery"]["kind"] == "time"
    assert payload["recovery"]["minimum_minutes"] == recipe.minutes + DEFAULT_THAW_MINUTES


def test_multi_day_optimizer_keeps_frozen_storage_for_thaw_time() -> None:
    recipe = next(recipe for recipe in load_recipe_specs() if recipe.id == "spinach-tofu-chicken-bowl")
    foods = _seed_foods()[:3]

    assert optimize_multi_day_plans(foods, recipe.minutes, specs=(recipe,), day_count=1).plans == ()
    result = optimize_multi_day_plans(foods, recipe.minutes + DEFAULT_THAW_MINUTES, specs=(recipe,), day_count=1)
    assert len(result.plans) == 1
    assert result.plans[0].thaw_food_ids == ("chicken-1",)
