"""Decode browser recordings and imported audio into a bounded mono PCM WAV."""
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from .config import MAX_UPLOAD


def normalize_audio(data: bytes) -> tuple[bytes, float]:
    if not data or len(data) > MAX_UPLOAD:
        raise ValueError("Le fichier doit peser entre 1 octet et 50 Mo.")
    ffmpeg = os.environ.get("AUDIO8_FFMPEG") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise ValueError("FFmpeg est nécessaire pour lire les fichiers et les enregistrements.")
    with tempfile.TemporaryDirectory(prefix="audio8-") as folder:
        source = Path(folder) / "input.audio"
        target = Path(folder) / "normalized.wav"
        source.write_bytes(data)
        # Decode at most 31 s so a compressed upload cannot allocate unbounded memory.
        # Disable network protocols; reference files are local, self-contained media.
        try:
            result = subprocess.run(
                [ffmpeg, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
                 "-i", str(source), "-t", "31", "-map", "0:a:0", "-ac", "1", "-ar", "44100",
                 "-c:a", "pcm_s16le", str(target)],
                capture_output=True, timeout=30, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Le décodage audio a dépassé 30 secondes.") from exc
        if result.returncode or not target.exists():
            raise ValueError("Format audio illisible. Essayez WAV, MP3, M4A, FLAC ou WebM.")
        normalized = target.read_bytes()
    samples, rate = sf.read(io.BytesIO(normalized), dtype="float32")
    duration = samples.size / rate
    if not 0.5 <= duration <= 30:
        raise ValueError("L’extrait doit durer entre 0,5 et 30 secondes.")
    if not np.isfinite(samples).all() or np.max(np.abs(samples)) < 0.0001:
        raise ValueError("L’extrait est silencieux ou contient des valeurs audio invalides.")
    return normalized, duration
