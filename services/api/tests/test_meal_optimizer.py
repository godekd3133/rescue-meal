from dataclasses import dataclass

from app.main import _seed_foods
import app.meal_optimizer as meal_optimizer
from app.meal_optimizer import optimize_multi_day_plans
from app.planner import RecipeIngredient, RecipeSpec, load_recipe_specs


@dataclass(frozen=True)
class Food:
    id: str
    canonical_name: str
    priority: int
    quantity: float
    unit: str


def test_cp_sat_selects_distinct_plans_without_exceeding_lot_capacity() -> None:
    result = optimize_multi_day_plans(
        _seed_foods(),
        30,
        specs=load_recipe_specs(),
    )

    assert result.engine == "or-tools-cp-sat"
    assert len(result.plans) == 3
    assert len({plan.recipe_id for plan in result.plans}) == 3
    mushroom_availability = [
        ingredient.available_quantity
        for plan in result.plans
        for ingredient in plan.ingredients
        if ingredient.canonical_name == "맛타리버섯"
    ]
    assert mushroom_availability == [2.0, 1.0]

    capacities = {food.id: food.quantity for food in _seed_foods()}
    usage: dict[str, float] = {}
    for plan in result.plans:
        for ingredient in plan.ingredients:
            for allocation in ingredient.allocations:
                usage[allocation.food_id] = usage.get(allocation.food_id, 0) + allocation.quantity
    assert all(quantity <= capacities[food_id] + 1e-9 for food_id, quantity in usage.items())


def test_cp_sat_respects_shared_lot_budget_when_greedy_candidates_compete() -> None:
    foods = (
        Food("tomato-a", "토마토", 1, 1, "개"),
        Food("onion-a", "양파", 2, 1, "개"),
        Food("egg-a", "달걀", 3, 1, "개"),
        Food("rice-a", "밥", 4, 1, "개"),
    )
    specs = (
        RecipeSpec(
            id="tomato-onion",
            title="토마토 양파 볶음",
            minutes=10,
            ingredients=(
                RecipeIngredient("토마토", 1, "개"),
                RecipeIngredient("양파", 1, "개"),
            ),
            steps=("볶습니다.",),
            safety_note="상태를 확인하세요.",
        ),
        RecipeSpec(
            id="tomato-egg",
            title="토마토 달걀 볶음",
            minutes=10,
            ingredients=(
                RecipeIngredient("토마토", 1, "개"),
                RecipeIngredient("달걀", 1, "개"),
            ),
            steps=("볶습니다.",),
            safety_note="상태를 확인하세요.",
        ),
        RecipeSpec(
            id="egg-rice",
            title="달걀 밥 볶음",
            minutes=10,
            ingredients=(
                RecipeIngredient("달걀", 1, "개"),
                RecipeIngredient("밥", 1, "개"),
            ),
            steps=("볶습니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    result = optimize_multi_day_plans(foods, 30, specs=specs, day_count=2)

    assert result.engine == "or-tools-cp-sat"
    assert len(result.plans) == 2
    assert len({plan.recipe_id for plan in result.plans}) == 2
    usage: dict[str, float] = {}
    for plan in result.plans:
        for ingredient in plan.ingredients:
            for allocation in ingredient.allocations:
                usage[allocation.food_id] = usage.get(allocation.food_id, 0) + allocation.quantity
    assert usage == {"tomato-a": 1.0, "onion-a": 1.0, "egg-a": 1.0, "rice-a": 1.0}


def test_cp_sat_carries_servings_into_candidate_capacity_and_daily_materialization() -> None:
    foods = (
        Food("rice-a", "밥", 1, 2, "개"),
        Food("egg-a", "달걀", 2, 2, "개"),
    )
    specs = (
        RecipeSpec(
            id="two-serving-egg-rice",
            title="두 인분 달걀 밥",
            minutes=10,
            ingredients=(
                RecipeIngredient("달걀", 1, "개"),
                RecipeIngredient("밥", 1, "개"),
            ),
            steps=("볶습니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )

    result = optimize_multi_day_plans(foods, 30, specs=specs, servings=2, day_count=1)

    assert result.engine == "or-tools-cp-sat"
    assert len(result.plans) == 1
    assert result.plans[0].servings == 2
    assert [ingredient.amount for ingredient in result.plans[0].ingredients] == [2, 2]
    assert all(ingredient.available for ingredient in result.plans[0].ingredients)


def test_empty_inventory_returns_a_safe_deterministic_result() -> None:
    result = optimize_multi_day_plans([], 30, specs=())

    assert result.plans == ()
    assert result.engine == "deterministic-greedy"
    assert result.fallback_reason == "inventory is empty"


def test_solver_unavailability_uses_the_deterministic_fallback(monkeypatch) -> None:
    monkeypatch.setattr(meal_optimizer, "warm_up_cp_sat", lambda: False)

    result = optimize_multi_day_plans(
        _seed_foods(),
        30,
        specs=load_recipe_specs(),
        day_count=2,
    )

    assert result.engine == "deterministic-greedy"
    assert len(result.plans) == 2
    assert result.fallback_reason is not None
    assert "fallback" in result.fallback_reason
