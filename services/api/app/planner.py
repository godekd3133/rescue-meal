from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import json
import math
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
    # Minutes of active quick-thaw (microwave defrost) the step needs when the
    # allocated lot is stored frozen. ``None`` uses DEFAULT_THAW_MINUTES; 0
    # means the ingredient can go into the pan/pot straight from frozen.
    thaw_minutes: int | None = None


@dataclass(frozen=True)
class PantryItem:
    """A staple/seasoning the recipe assumes the kitchen already has.

    Pantry items are deliberately outside ``ingredients``: they never take
    part in lot matching, allocation, missing-ingredient or shopping-list
    calculation. They still contribute to recipe allergen metadata.
    """

    name: str
    amount: float | None
    unit: str
    optional: bool = False


@dataclass(frozen=True)
class RecipeStep:
    stage: str
    text: str
    heat: str | None = None
    minutes: int | None = None


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
    pantry: tuple[PantryItem, ...] = ()
    step_details: tuple[RecipeStep, ...] = ()


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
    pantry: tuple[PantryItem, ...] = ()
    step_details: tuple[RecipeStep, ...] = ()
    frozen_food_ids: tuple[str, ...] = ()
    thaw_food_ids: tuple[str, ...] = ()
    thaw_minutes: int = 0
    total_minutes: int = 0


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

# Quick-thaw estimate for one serving of a frozen protein lot (about
# 100-200 g) using a microwave defrost setting. Refrigerator thawing takes
# many hours and cold-water thawing 30+ minutes, so neither can fit a
# same-meal time budget; the planner therefore counts only this active
# quick-thaw time and tells the user to cook immediately afterwards.
DEFAULT_THAW_MINUTES = 10

_CURATED_ALLERGEN_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("두부", "콩", "대두", "간장", "된장", "고추장"), "soy"),
    (("달걀", "계란", "에그", "마요네즈"), "egg"),
    (("우유", "치즈", "버터", "생크림", "요거트", "요구르트"), "milk"),
    (("참치", "고등어", "연어", "생선"), "fish"),
    # Do not use the bare syllable "게": it matches 스파게티 and ordinary
    # Korean adverbs in step text (얇게, 노릇하게). Molluscs are grouped with
    # 조개/굴 under the same conservative key.
    (("새우", "꽃게", "대게", "게살", "게장", "크랩", "조개", "바지락", "홍합", "전복", "굴", "오징어", "문어", "낙지", "주꾸미"), "shellfish"),
    # Korean brewed soy sauce, gochujang and many doenjang/curry/batter mixes
    # list wheat on the label; tag them conservatively.
    (("밀가루", "빵가루", "파스타", "국수", "면", "간장", "고추장", "된장", "부침가루", "튀김가루", "카레"), "wheat"),
    (("땅콩",), "peanut"),
    (("호두", "아몬드", "잣", "캐슈"), "tree_nut"),
)


def _curated_allergens(
    ingredients: tuple[RecipeIngredient, ...],
    *,
    title: str = "",
    steps: tuple[str, ...] = (),
    pantry: tuple[PantryItem, ...] = (),
) -> tuple[str, ...]:
    searchable_text = tuple(
        _name_key(value)
        for ingredient in ingredients
        for value in (ingredient.canonical_name, *ingredient.aliases)
    ) + tuple(_name_key(item.name) for item in pantry) + (_name_key(title),) + tuple(_name_key(step) for step in steps)
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


def food_conversion_to_unit(food: FoodLike, recipe_unit: str) -> float | None:
    direct = conversion_to_unit(food.unit, recipe_unit)
    if direct is not None:
        return direct
    reference = getattr(food, "quantity_reference", None)
    if reference is None:
        return None
    amount = getattr(reference, "amount", None)
    unit = getattr(reference, "unit", None)
    if not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount <= 0 or unit not in {"g", "ml", "개"}:
        return None
    factor = conversion_to_unit(unit, recipe_unit)
    return amount * factor if factor is not None else None


def _available_quantity(food: FoodLike) -> tuple[float | None, str | None]:
    quantity = getattr(food, "quantity", None)
    unit = getattr(food, "unit", None)
    try:
        return (float(quantity), str(unit)) if quantity is not None and unit is not None else (None, None)
    except (TypeError, ValueError):
        return None, str(unit) if unit is not None else None


def recipe_uses_food(recipe: RecipeSpec, food: FoodLike) -> bool:
    """Return True when any recipe ingredient would match this food by name."""

    available_by_name = {_name_key(food.canonical_name): [food]}
    return any(_find_ingredient_match(ingredient, available_by_name)[0] for ingredient in recipe.ingredients)


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


def _recipe_step_from_value(value: Any) -> RecipeStep:
    if isinstance(value, str):
        return RecipeStep(stage="조리", text=value)
    minutes = value.get("minutes")
    return RecipeStep(
        stage=str(value.get("stage") or "조리"),
        text=str(value["text"]),
        heat=value.get("heat"),
        minutes=int(minutes) if minutes is not None else None,
    )


def _recipe_spec_from_dict(item: dict[str, Any]) -> RecipeSpec:
    ingredients = tuple(
        RecipeIngredient(
            canonical_name=ingredient["canonical_name"],
            amount=float(ingredient["amount"]),
            unit=ingredient["unit"],
            aliases=tuple(ingredient.get("aliases", [])),
            thaw_minutes=int(ingredient["thaw_minutes"]) if ingredient.get("thaw_minutes") is not None else None,
        )
        for ingredient in item["ingredients"]
    )
    pantry = tuple(
        PantryItem(
            name=str(entry["name"]),
            amount=float(entry["amount"]) if entry.get("amount") is not None else None,
            unit=str(entry.get("unit") or ""),
            optional=bool(entry.get("optional", False)),
        )
        for entry in item.get("pantry", [])
    )
    step_details = tuple(_recipe_step_from_value(step) for step in item["steps"])
    steps = tuple(step.text for step in step_details)
    has_structured_steps = any(not isinstance(step, str) for step in item["steps"])
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
        allergens=tuple(declared_allergens) if declared_allergens is not None else _curated_allergens(ingredients, title=item["title"], steps=steps, pantry=pantry),
        pantry=pantry,
        step_details=step_details if has_structured_steps else (),
    )


def _is_frozen(food: FoodLike) -> bool:
    return getattr(food, "storage_type", None) == "frozen"


def _with_object_particle(value: str) -> str:
    """Attach 을/를 by the final syllable; non-Hangul endings read as vowel-final."""
    last = ord(value[-1]) if value else 0
    has_final_consonant = 0xAC00 <= last <= 0xD7A3 and (last - 0xAC00) % 28 != 0
    return f"{value}{'을' if has_final_consonant else '를'}"


def _thaw_step(names: list[str], minutes: int) -> RecipeStep:
    label = "·".join(names)
    return RecipeStep(
        stage="해동",
        heat="전자레인지 해동",
        minutes=minutes,
        text=(
            f"냉동 보관 중인 {_with_object_particle(label)} 먼저 해동합니다. 포장지의 해동 안내가 있으면 그대로 따르고, "
            f"없으면 전자레인지 해동 모드로 약 {minutes}분 녹인 뒤 바로 조리하세요. "
            "미리 준비할 수 있다면 전날 냉장실로 옮겨 천천히 해동해도 됩니다."
        ),
    )


def _from_frozen_step(names: list[str]) -> RecipeStep:
    label = "·".join(names)
    return RecipeStep(
        stage="해동",
        text=f"냉동 보관 중인 {label}은(는) 해동하지 않고 얼린 채로 조리 단계에 넣어도 됩니다. 익는 시간이 1~2분 더 걸릴 수 있어요.",
    )


def load_recipe_specs(path: Path = RECIPE_FIXTURE_PATH) -> tuple[RecipeSpec, ...]:
    raw_specs = json.loads(path.read_text(encoding="utf-8"))
    return tuple(_recipe_spec_from_dict(item) for item in raw_specs)


def recipe_quantity_review_food_ids(
    foods: list[FoodLike],
    *,
    specs: tuple[RecipeSpec, ...],
    exclude_recipe_ids: set[str] | frozenset[str] | None = None,
    preferred_recipe_id: str | None = None,
    avoid_allergens: set[str] | frozenset[str] | None = None,
) -> tuple[str, ...]:
    excluded = exclude_recipe_ids or set()
    avoided = set(avoid_allergens or ())
    eligible = tuple(recipe for recipe in specs if recipe.id not in excluded
        and (preferred_recipe_id is None or recipe.id == preferred_recipe_id)
        and (not avoided or (recipe.allergens is not None and not avoided.intersection(recipe.allergens))))
    result: list[str] = []
    for food in foods:
        by_name = {_name_key(food.canonical_name): [food]}
        units = [ingredient.unit for recipe in eligible for ingredient in recipe.ingredients
            if _find_ingredient_match(ingredient, by_name)[0]]
        quantity, unit = _available_quantity(food)
        if units and (quantity is None or not math.isfinite(quantity) or unit is None or not any(food_conversion_to_unit(food, required) is not None for required in units)):
            result.append(food.id)
    return tuple(dict.fromkeys(result))


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
    candidates = tuple(recipe for recipe in recipes if recipe.minutes <= max_minutes)
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
        priority_bonus = 0
        for ingredient in recipe.ingredients:
            required_amount = float(Decimal(str(ingredient.amount)) * servings)
            matched_candidates, match_type = _find_ingredient_match(ingredient, available_by_name)
            compatible: list[tuple[FoodLike, float, float]] = []
            for food in matched_candidates:
                quantity, unit = _available_quantity(food)
                conversion = food_conversion_to_unit(food, ingredient.unit) if unit is not None else None
                if quantity is not None and math.isfinite(quantity) and quantity >= 0 and conversion is not None:
                    compatible.append((food, float(Decimal(str(quantity)) * Decimal(str(conversion))), conversion))
            # Prefer refrigerated/ambient lots so a frozen lot is only thawed
            # when it is actually needed (stable: keeps use-first order).
            compatible.sort(key=lambda entry: _is_frozen(entry[0]))
            total_quantity = float(sum((Decimal(str(quantity)) for _, quantity, _ in compatible), Decimal(0))) if compatible else None
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
                    allocations.append(FoodAllocation(food_id=food.id, quantity=float(Decimal(str(allocated)) / Decimal(str(conversion))), unit=food.unit))
                    remaining = float(Decimal(str(remaining)) - Decimal(str(allocated)))
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
                # A split stock lot still supplies one recipe ingredient. Use its
                # earliest-use lot once so splitting stock cannot inflate rank.
                priority_bonus += max(
                    max(0, 12 - food.priority)
                    for food, _, _ in compatible
                    if food.id in allocated_ids
                )
                matched_ids = {food.id for food in matched_foods}
                for food, _, _ in compatible:
                    if food.id in allocated_ids and food.id not in matched_ids:
                        matched_foods.append(food)
                        matched_ids.add(food.id)
            else:
                missing.append(ingredient)
        if not matched_foods:
            continue
        thaw_minutes = _recipe_thaw_minutes(recipe, matches, foods)
        if recipe.minutes + thaw_minutes > max_minutes:
            # The time limit is strict for the whole meal, including the
            # quick thaw a frozen lot needs before the first cooking step.
            continue
        ratio = (len(recipe.ingredients) - len(missing)) / len(recipe.ingredients)
        # Thaw time gates eligibility above but does not change the rank, so
        # a frozen lot is neither favoured nor buried relative to the
        # existing use-first priority ordering.
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
            amount=float(Decimal(str(ingredient.amount)) * servings),
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
    foods_by_id = {food.id: food for food in foods}
    frozen_food_ids: list[str] = []
    thaw_food_ids: list[str] = []
    thaw_names: list[str] = []
    from_frozen_names: list[str] = []
    thaw_minutes = 0
    for ingredient in recipe.ingredients:
        frozen_ids = [
            allocation.food_id
            for allocation in matches[ingredient.canonical_name].allocations
            if allocation.food_id in foods_by_id and _is_frozen(foods_by_id[allocation.food_id])
        ]
        if not frozen_ids:
            continue
        frozen_food_ids.extend(frozen_ids)
        minutes = _ingredient_thaw_minutes(ingredient)
        if minutes > 0:
            thaw_food_ids.extend(frozen_ids)
            thaw_names.append(ingredient.canonical_name)
            thaw_minutes += minutes
        else:
            from_frozen_names.append(ingredient.canonical_name)
    base_details = recipe.step_details or tuple(RecipeStep(stage="조리", text=step) for step in recipe.steps)
    prefix: list[RecipeStep] = []
    if thaw_names:
        prefix.append(_thaw_step(thaw_names, thaw_minutes))
    if from_frozen_names:
        prefix.append(_from_frozen_step(from_frozen_names))
    step_details = tuple(prefix) + base_details if (prefix or recipe.step_details) else ()
    steps = tuple(step.text for step in prefix) + recipe.steps
    reason = "식품 목록에 있는 재료를 활용한 메뉴예요."
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
        steps=steps,
        safety_note=recipe.safety_note,
        source=recipe.source,
        planner_version=PLANNER_VERSION,
        source_name=recipe.source_name,
        source_url=recipe.source_url,
        license=recipe.license,
        source_revision=recipe.source_revision,
        allergens=recipe.allergens,
        pantry=tuple(
            PantryItem(
                name=item.name,
                amount=float(Decimal(str(item.amount)) * servings) if item.amount is not None else None,
                unit=item.unit,
                optional=item.optional,
            )
            for item in recipe.pantry
        ),
        step_details=step_details,
        frozen_food_ids=tuple(dict.fromkeys(frozen_food_ids)),
        thaw_food_ids=tuple(dict.fromkeys(thaw_food_ids)),
        thaw_minutes=thaw_minutes,
        total_minutes=recipe.minutes + thaw_minutes,
    )


def _ingredient_thaw_minutes(ingredient: RecipeIngredient) -> int:
    return DEFAULT_THAW_MINUTES if ingredient.thaw_minutes is None else max(0, ingredient.thaw_minutes)


def _recipe_thaw_minutes(recipe: RecipeSpec, matches: dict[str, IngredientMatch], foods: list[FoodLike]) -> int:
    frozen_ids = {food.id for food in foods if _is_frozen(food)}
    if not frozen_ids:
        return 0
    return sum(
        _ingredient_thaw_minutes(ingredient)
        for ingredient in recipe.ingredients
        if any(allocation.food_id in frozen_ids for allocation in matches[ingredient.canonical_name].allocations)
    )
