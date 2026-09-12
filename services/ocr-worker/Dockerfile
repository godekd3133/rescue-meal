# PaddlePaddle 3.3.1 publishes the Linux CPU wheel for x86_64, not Linux
# aarch64. Keep the worker image's target explicit so `docker build .` on an
# Apple Silicon host does not resolve an unusable ARM virtualenv by accident.
ARG OCR_WORKER_PLATFORM=linux/amd64
FROM --platform=${OCR_WORKER_PLATFORM} python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev

COPY app ./app

# Run the worker as a dedicated non-root user. The virtualenv is fully
# resolved at build time, so the runtime entrypoint uses it directly instead
# of re-validating through `uv run` on every container start. The PaddleX
# model cache lives in the user's home so the named volume can attach there.
ENV PADDLE_PDX_CACHE_HOME=/home/rescue/.paddlex
RUN groupadd --system --gid 10001 rescue \
    && useradd --system --uid 10001 --gid rescue --create-home rescue \
    && mkdir -p /home/rescue/.paddlex \
    && chown -R rescue:rescue /app /home/rescue

USER rescue

EXPOSE 8002
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
