from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


AllergenCode = Literal["soy", "egg", "milk", "fish", "shellfish", "wheat", "peanut", "tree_nut"]

ALLERGEN_CODES: tuple[AllergenCode, ...] = (
    "soy",
    "egg",
    "milk",
    "fish",
    "shellfish",
    "wheat",
    "peanut",
    "tree_nut",
)


class MealPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    avoid_allergens: list[AllergenCode] = Field(default_factory=list, max_length=len(ALLERGEN_CODES))

    @field_validator("avoid_allergens")
    @classmethod
    def normalize_allergens(cls, values: list[AllergenCode]) -> list[AllergenCode]:
        """Keep API writes duplicate-free while preserving the product order."""

        selected = set(values)
        return [allergen for allergen in ALLERGEN_CODES if allergen in selected]
