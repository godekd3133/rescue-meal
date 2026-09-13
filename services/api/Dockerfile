FROM python:3.14-slim

# Apply Debian security updates: the pinned base tag can lag behind patched
# packages, and the weekly image scan fails on fixable CRITICAL/HIGH findings.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1

WORKDIR /app

COPY services/api/pyproject.toml services/api/uv.lock ./
# Runtime needs only the venv: drop pip/setuptools (fixable CVE surface) and
# uv's caches once dependencies are installed.
RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev \
    && pip uninstall -y pip setuptools \
    && rm -rf /usr/local/lib/python3.12/site-packages/pip* \
       /usr/local/lib/python3.12/site-packages/setuptools* \
       /usr/local/lib/python3.12/site-packages/pkg_resources \
       /usr/local/lib/python3.12/site-packages/_distutils_hack \
       /tmp/uv-*

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
