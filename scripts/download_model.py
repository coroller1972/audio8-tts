"""Download a pinned snapshot of the official CPU model into the project."""
import json
import os
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download

ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4"
destination = Path(os.environ.get("AUDIO8_MODEL_DIR", ROOT / "models" / "audio8-int4"))
lock_path = ROOT / "model.lock.json"
if lock_path.exists():
    revision = json.loads(lock_path.read_text())["revision"]
else:
    revision = HfApi().model_info(MODEL_ID).sha
print(f"Downloading {MODEL_ID}@{revision} into {destination}", flush=True)
snapshot_download(
    MODEL_ID,
    revision=revision,
    local_dir=destination,
    allow_patterns=["*.onnx", "*.data", "*.json", "tokenizer/*", "registration/*", "LICENSE", "NOTICE"],
)
lock = {"model_id": MODEL_ID, "revision": revision}
lock_path.write_text(json.dumps(lock, indent=2) + "\n")
(destination / "studio_revision.json").write_text(json.dumps(lock, indent=2) + "\n")
print("Model ready. Run npm run dev.", flush=True)
