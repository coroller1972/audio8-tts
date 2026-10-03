#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo "Installez uv : https://docs.astral.sh/uv/"; exit 1; }
command -v ffmpeg >/dev/null || { echo "Installez FFmpeg : brew install ffmpeg"; exit 1; }
npm install
UV_CACHE_DIR=.cache/uv uv sync --python 3.12
HF_HOME=.cache/huggingface UV_CACHE_DIR=.cache/uv uv run python scripts/download_model.py
