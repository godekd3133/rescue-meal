"""Disposable connected-browser fixtures; never imported by the production entrypoint."""
import os

if os.getenv("RESCUE_MEAL_E2E_FIXTURES") != "1":
    raise RuntimeError("This entrypoint is only for disposable browser tests")

from fastapi import HTTPException
from . import main
from .auth import current_auth_context, current_workspace_id

app = main.app


@app.post("/__e2e/workspace/examples")
def seed_workspace_examples() -> dict[str, list[str]]:
    context = current_auth_context()
    if context.role != "guest" or current_workspace_id() == main.DEFAULT_WORKSPACE_ID:
        raise HTTPException(status_code=403, detail="A private test guest workspace is required")
    def seed() -> dict[str, list[str]]:
        if main.store.foods:
            raise HTTPException(status_code=409, detail="Examples require an empty disposable workspace")
        foods = main._seed_foods()
        for food in foods:
            main.store.foods[food.id] = main._FoodRecord(food)
        return {"food_ids": [food.id for food in foods]}

    return main.workspace_mutation.run(seed)
