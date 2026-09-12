from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Any, Literal, Protocol
import unicodedata


class FoodLike(Protocol):
    id: str
    canonical_name: str
    priority: int
    quantity: float
    unit: str


@dataclass(frozen=True)
class RecipeIngredient:
    canonical_name: str
    amount: float
    unit: str
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class FoodAllocation:
    food_id: str
    quantity: float
    unit: str


@dataclass(frozen=True)
class RecipeSpec:
    id: str
    title: str
    minutes: int
    ingredients: tuple[RecipeIngredient, ...]
    steps: tuple[str, ...]
    safety_note: str
    source_name: str = "Rescue Meal 팀 작성 레시피"
    source_url: str | None = None
    license: str = "project-authored"
    source_revision: str = "recipes-v1"
    source: str = "recipe_fixture"
    allergens: tuple[str, ...] | None = None


@dataclass(frozen=True)
class PlannedIngredient:
    canonical_name: str
    amount: float
    unit: str
    available: bool
    available_food_id: str | None
    available_quantity: float | None = None
    available_unit: str | None = None
    match_type: str = "none"
    quantity_match: "QuantityMatch" = "missing"
    allocations: tuple[FoodAllocation, ...] = ()


@dataclass(frozen=True)
class IngredientMatch:
    candidates: tuple[FoodLike, ...]
    match_type: str
    enough: bool
    total_quantity: float | None
    available_unit: str | None
    quantity_match: "QuantityMatch"
    allocations: tuple[FoodAllocation, ...]


@dataclass(frozen=True)
class PlannedRecipe:
    recipe_id: str
    servings: int
    title: str
    minutes: int
    inventory_ids: tuple[str, ...]
    ingredients: tuple[PlannedIngredient, ...]
    missing_ingredients: tuple[str, ...]
    matched_ratio: float
    score: float
    reason: str
    steps: tuple[str, ...]
    safety_note: str
    source: str
    planner_version: str
    source_name: str
    source_url: str | None
    license: str
    source_revision: str
    allergens: tuple[str, ...] | None


_RECIPE_FIXTURE_RELATIVE_PATH = Path("data") / "fixtures" / "recipes" / "recipes-v1.json"


def _resolve_recipe_fixture_path(module_file: Path = Path(__file__)) -> Path:
    """Resolve the catalog in both the source tree and the packaged API image.

    The development checkout keeps the catalog at repository-level
    ``data/fixtures`` while the container image copies that directory under
    ``/app/data``. Do not index a fixed ``Path.parents`` entry: the absolute
    depth is different in those two layouts and the old expression crashed
    during container import before FastAPI could start.
    """

    configured = os.environ.get("RESCUE_MEAL_RECIPE_CATALOG_PATH", "").strip()
    if configured:
        configured_path = Path(configured).expanduser().resolve()
        if configured_path.is_file():
            return configured_path
        raise FileNotFoundError(f"Configured recipe catalog does not exist: {configured_path}")

    resolved_module_file = module_file.resolve()
    roots = (resolved_module_file.parent, *resolved_module_file.parents)
    seen: set[Path] = set()
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        candidate = root / _RECIPE_FIXTURE_RELATIVE_PATH
        if candidate.is_file():
            return candidate

    raise FileNotFoundError(
        "Recipe catalog not found. Set RESCUE_MEAL_RECIPE_CATALOG_PATH or package data/fixtures/recipes/recipes-v1.json."
    )


RECIPE_FIXTURE_PATH = _resolve_recipe_fixture_path()
PLANNER_VERSION = "recipe-planner-v2"
MIN_SERVINGS = 1
MAX_SERVINGS = 8

QuantityMatch = Literal["exact", "converted", "incompatible", "missing"]

_CURATED_ALLERGEN_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("두부", "콩", "대두", "간장", "된장"), "soy"),
    (("달걀", "계란", "에그"), "egg"),
    (("우유", "치즈", "버터", "생크림"), "milk"),
    (("참치", "고등어", "연어", "생선"), "fish"),
    (("새우", "게", "조개", "굴"), "shellfish"),
    (("밀가루", "빵가루", "파스타", "국수", "면"), "wheat"),
    (("땅콩",), "peanut"),
    (("호두", "아몬드", "잣", "캐슈"), "tree_nut"),
)


def _curated_allergens(
    ingredients: tuple[RecipeIngredient, ...],
    *,
    title: str = "",
    steps: tuple[str, ...] = (),
) -> tuple[str, ...]:
    searchable_text = tuple(
        _name_key(value)
        for ingredient in ingredients
        for value in (ingredient.canonical_name, *ingredient.aliases)
    ) + (_name_key(title),) + tuple(_name_key(step) for step in steps)
    found = {
        allergen
        for tokens, allergen in _CURATED_ALLERGEN_RULES
        if any(any(_name_key(token) in text for token in tokens) for text in searchable_text)
    }
    order = ("soy", "egg", "milk", "fish", "shellfish", "wheat", "peanut", "tree_nut")
    return tuple(allergen for allergen in order if allergen in found)


def _name_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def normalize_unit(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().casefold().replace(" ", "")
    return _UNIT_ALIASES.get(normalized, normalized)


_UNIT_ALIASES: dict[str, str] = {
    "그램": "g",
    "gram": "g",
    "grams": "g",
    "킬로그램": "kg",
    "킬로": "kg",
    "키로그램": "kg",
    "키로": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "밀리그램": "mg",
    "milligram": "mg",
    "milligrams": "mg",
    "밀리리터": "ml",
    "밀리": "ml",
    "milliliter": "ml",
    "milliliters": "ml",
    "cc": "ml",
    "㎖": "ml",
    "리터": "l",
    "리터스": "l",
    "liter": "l",
    "liters": "l",
    "ℓ": "l",
    "개수": "개",
    "ea": "개",
    "pc": "개",
    "pcs": "개",
    "piece": "개",
    "pieces": "개",
}


_CONVERTIBLE_UNITS: dict[str, tuple[str, float]] = {
    "mg": ("mass", 0.001),
    "g": ("mass", 1),
    "kg": ("mass", 1000),
    "ml": ("volume", 1),
    "cc": ("volume", 1),
    "l": ("volume", 1000),
}


def conversion_to_unit(from_unit: str, recipe_unit: str) -> float | None:
    from_key = normalize_unit(from_unit)
    recipe_key = normalize_unit(recipe_unit)
    if from_key == recipe_key:
        return 1
    from_definition = _CONVERTIBLE_UNITS.get(from_key)
    recipe_definition = _CONVERTIBLE_UNITS.get(recipe_key)
    if from_definition is None or recipe_definition is None or from_definition[0] != recipe_definition[0]:
        return None
    return from_definition[1] / recipe_definition[1]


def _available_quantity(food: FoodLike) -> tuple[float | None, str | None]:
    quantity = getattr(food, "quantity", None)
    unit = getattr(food, "unit", None)
    try:
        return (float(quantity), str(unit)) if quantity is not None and unit is not None else (None, None)
    except (TypeError, ValueError):
        return None, str(unit) if unit is not None else None


def _find_ingredient_match(
    ingredient: RecipeIngredient,
    available_by_name: dict[str, list[FoodLike]],
) -> tuple[list[FoodLike], str]:
    exact_key = _name_key(ingredient.canonical_name)
    exact = available_by_name.get(exact_key)
    if exact:
        return exact, "exact"
    for alias in ingredient.aliases:
        alias_match = available_by_name.get(_name_key(alias))
        if alias_match:
            return alias_match, "alias"
    return [], "none"


def _recipe_spec_from_dict(item: dict[str, Any]) -> RecipeSpec:
    ingredients = tuple(
        RecipeIngredient(
            canonical_name=ingredient["canonical_name"],
            amount=float(ingredient["amount"]),
            unit=ingredient["unit"],
            aliases=tuple(ingredient.get("aliases", [])),
        )
        for ingredient in item["ingredients"]
    )
    steps = tuple(item["steps"])
    declared_allergens = item.get("allergens")
    return RecipeSpec(
        id=item["id"],
        title=item["title"],
        minutes=int(item["minutes"]),
        ingredients=ingredients,
        steps=steps,
        safety_note=item["safety_note"],
        source_name=item.get("provenance", {}).get("source_name", "Rescue Meal 팀 작성 레시피"),
        source_url=item.get("provenance", {}).get("source_url"),
        license=item.get("provenance", {}).get("license", "unknown"),
        source_revision=item.get("provenance", {}).get("revision", "unknown"),
        source=item.get("provenance", {}).get("source", "recipe_fixture"),
        allergens=tuple(declared_allergens) if declared_allergens is not None else _curated_allergens(ingredients, title=item["title"], steps=steps),
    )


def load_recipe_specs(path: Path = RECIPE_FIXTURE_PATH) -> tuple[RecipeSpec, ...]:
    raw_specs = json.loads(path.read_text(encoding="utf-8"))
    return tuple(_recipe_spec_from_dict(item) for item in raw_specs)


def plan_recipe(
    foods: list[FoodLike],
    max_minutes: int,
    *,
    specs: tuple[RecipeSpec, ...] | None = None,
    exclude_recipe_ids: set[str] | frozenset[str] | None = None,
    preferred_recipe_id: str | None = None,
    avoid_allergens: set[str] | frozenset[str] | None = None,
    servings: int = 1,
) -> PlannedRecipe | None:
    if not isinstance(servings, int) or not MIN_SERVINGS <= servings <= MAX_SERVINGS:
        raise ValueError(f"servings must be between {MIN_SERVINGS} and {MAX_SERVINGS}")
    if not foods:
        return None
    available_by_name: dict[str, list[FoodLike]] = {}
    for food in foods:
        available_by_name.setdefault(_name_key(food.canonical_name), []).append(food)
    excluded = exclude_recipe_ids or set()
    recipes = tuple(recipe for recipe in (specs or load_recipe_specs()) if recipe.id not in excluded)
    avoided = set(avoid_allergens or ())
    if avoided:
        recipes = tuple(recipe for recipe in recipes if recipe.allergens is not None and not avoided.intersection(recipe.allergens))
    time_limited = tuple(recipe for recipe in recipes if recipe.minutes <= max_minutes)
    candidates = time_limited or recipes
    if preferred_recipe_id is not None:
        candidates = tuple(recipe for recipe in candidates if recipe.id == preferred_recipe_id)
        if not candidates:
            return None
    scored: list[tuple[float, float, int, str, RecipeSpec, list[FoodLike], list[RecipeIngredient]]] = []
    candidate_matches: dict[str, dict[str, IngredientMatch]] = {}
    for recipe in candidates:
        matches: dict[str, IngredientMatch] = {}
        matched_foods: list[FoodLike] = []
        missing: list[RecipeIngredient] = []
        for ingredient in recipe.ingredients:
            required_amount = round(ingredient.amount * servings, 3)
            matched_candidates, match_type = _find_ingredient_match(ingredient, available_by_name)
            compatible: list[tuple[FoodLike, float, float]] = []
            for food in matched_candidates:
                quantity, unit = _available_quantity(food)
                conversion = conversion_to_unit(unit, ingredient.unit) if unit is not None else None
                if quantity is not None and conversion is not None:
                    compatible.append((food, quantity * conversion, conversion))
            total_quantity = round(sum(quantity for _, quantity, _ in compatible), 3) if compatible else None
            available_unit = ingredient.unit if compatible else None
            if not matched_candidates:
                quantity_match: QuantityMatch = "missing"
            elif not compatible:
                quantity_match = "incompatible"
            elif any(conversion != 1 for _, _, conversion in compatible):
                quantity_match = "converted"
            else:
                quantity_match = "exact"
            remaining = required_amount
            allocations: list[FoodAllocation] = []
            for food, quantity, conversion in compatible:
                if remaining <= 0:
                    break
                allocated = min(quantity, remaining)
                if allocated > 0:
                    allocations.append(FoodAllocation(food_id=food.id, quantity=round(allocated / conversion, 3), unit=food.unit))
                    remaining = round(remaining - allocated, 3)
            enough = bool(allocations) and remaining <= 0
            matches[ingredient.canonical_name] = IngredientMatch(
                candidates=tuple(matched_candidates),
                match_type=match_type,
                enough=enough,
                total_quantity=total_quantity,
                available_unit=available_unit,
                quantity_match=quantity_match,
                allocations=tuple(allocations),
            )
            if enough:
                allocated_ids = {allocation.food_id for allocation in allocations}
                matched_ids = {food.id for food in matched_foods}
                for food, _, _ in compatible:
                    if food.id in allocated_ids and food.id not in matched_ids:
                        matched_foods.append(food)
                        matched_ids.add(food.id)
            else:
                missing.append(ingredient)
        if not matched_foods:
            continue
        ratio = len(matched_foods) / len(recipe.ingredients)
        priority_bonus = sum(max(0, 12 - food.priority) for food in matched_foods)
        score = round(ratio * 100 + priority_bonus - len(missing) * 8 - recipe.minutes * 0.6, 2)
        scored.append((score, ratio, recipe.minutes, recipe.id, recipe, matched_foods, missing))
        candidate_matches[recipe.id] = matches
    if not scored:
        return None
    _, ratio, _, _, recipe, matched_foods, missing = sorted(scored, key=lambda item: (-item[0], -item[1], item[2], item[3]))[0]
    matches = candidate_matches[recipe.id]
    ingredients = tuple(
        PlannedIngredient(
            canonical_name=ingredient.canonical_name,
            amount=round(ingredient.amount * servings, 3),
            unit=ingredient.unit,
            available=matches[ingredient.canonical_name].enough,
            available_food_id=(
                matches[ingredient.canonical_name].allocations[0].food_id
                if matches[ingredient.canonical_name].allocations
                else matches[ingredient.canonical_name].candidates[0].id
                if matches[ingredient.canonical_name].candidates
                else None
            ),
            available_quantity=matches[ingredient.canonical_name].total_quantity,
            available_unit=matches[ingredient.canonical_name].available_unit,
            match_type=matches[ingredient.canonical_name].match_type,
            quantity_match=matches[ingredient.canonical_name].quantity_match,
            allocations=matches[ingredient.canonical_name].allocations,
        )
        for ingredient in recipe.ingredients
    )
    allocated_ids = {
        allocation.food_id
        for match in matches.values()
        for allocation in match.allocations
    }
    inventory_ids = tuple(food.id for food in foods if food.id in allocated_ids)
    if missing:
        reason = f"재료 {len(recipe.ingredients) - len(missing)}/{len(recipe.ingredients)}개가 있고, 먼저 먹기 순서가 높은 식품을 우선했어요."
    else:
        reason = "현재 식품만으로 만들 수 있고, 먼저 먹기 순서가 높은 재료를 우선했어요."
    return PlannedRecipe(
        recipe_id=recipe.id,
        servings=servings,
        title=recipe.title,
        minutes=recipe.minutes,
        inventory_ids=inventory_ids,
        ingredients=ingredients,
        missing_ingredients=tuple(ingredient.canonical_name for ingredient in missing),
        matched_ratio=round(ratio, 3),
        score=sorted(scored, key=lambda item: (-item[0], -item[1], item[2], item[3]))[0][0],
        reason=reason,
        steps=recipe.steps,
        safety_note=recipe.safety_note,
        source=recipe.source,
        planner_version=PLANNER_VERSION,
        source_name=recipe.source_name,
        source_url=recipe.source_url,
        license=recipe.license,
        source_revision=recipe.source_revision,
        allergens=recipe.allergens,
    )
