#!/usr/bin/env bash
set -euo pipefail

python -m pip install --upgrade pip "setuptools<81" wheel
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
python -m pip install -r requirements-audio.txt
bash scripts/setup-beatnetlite.sh

ffmpeg -version | head -n 1
python - <<'PY'
from importlib.metadata import version
import torch
import torchaudio

for package in ("demucs", "basic-pitch", "librosa"):
    print(f"{package} {version(package)}")
print(f"torch {torch.__version__}; torchaudio {torchaudio.__version__}")
print(f"CUDA available: {torch.cuda.is_available()} (CPU Codespaces uses CPU)")
PY
