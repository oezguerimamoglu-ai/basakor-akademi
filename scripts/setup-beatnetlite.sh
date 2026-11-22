#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
import subprocess

commit = "90828feb6cf9bc7564e5d5fa37bc1b240119e1a2"
repo = Path.home() / ".cache" / "basakor-akademi" / "beatnetlite"
url = "https://github.com/turbo/BeatNetLite.git"
repo.parent.mkdir(parents=True, exist_ok=True)

if not (repo / ".git").is_dir():
    subprocess.run(["git", "clone", "--no-checkout", url, str(repo)], check=True)

subprocess.run(["git", "-C", str(repo), "fetch", "--depth", "1", "origin", commit], check=True)
subprocess.run(["git", "-C", str(repo), "checkout", "--detach", commit], check=True)
if not (repo / "BeatNetLite.py").is_file():
    raise FileNotFoundError(f"BeatNetLite source not found in {repo}")

print(f"BeatNetLite ready at {repo} ({commit[:12]})")
PY
