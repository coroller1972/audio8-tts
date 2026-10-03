import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4"
MODEL_DIR = Path(os.environ.get("AUDIO8_MODEL_DIR", ROOT / "models" / "audio8-int4"))
DATA_DIR = Path(os.environ.get("AUDIO8_DATA_DIR", ROOT / "data"))
THREADS = int(os.environ.get("AUDIO8_THREADS", "5"))
MAX_UPLOAD = 50 * 1024 * 1024
