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

# Run the service as a dedicated non-root user. The virtualenv is fully
# resolved at build time, so the runtime entrypoint uses it directly instead
# of re-validating through `uv run` on every container start.
RUN groupadd --system --gid 10001 rescue \
    && useradd --system --uid 10001 --gid rescue --home-dir /app rescue \
    && chown -R rescue:rescue /app

USER rescue

EXPOSE 8000
CMD ["sh", "-c", "set -e; if [ \"${RESCUE_MEAL_ENVIRONMENT:-local}\" = production ]; then /app/.venv/bin/python scripts/preflight_production.py --mode production; fi; exec /app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"]
