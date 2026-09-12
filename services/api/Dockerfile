FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY services/api/pyproject.toml services/api/uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev

COPY services/api/app ./app
COPY services/api/scripts ./scripts
# The planner catalog is runtime data, not a repository-relative source path.
# Package it into the image so the API can boot from a clean container.
COPY data/fixtures/recipes ./data/fixtures/recipes

EXPOSE 8000
CMD ["sh", "-c", "set -e; if [ \"${RESCUE_MEAL_ENVIRONMENT:-local}\" = production ]; then uv run --no-dev python scripts/preflight_production.py --mode production; fi; exec uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port 8000"]
