import io
import shutil
import subprocess

import numpy as np
import pytest
import soundfile as sf

from backend.audio import normalize_audio


def wav(seconds=1, rate=16000, silent=False):
    samples = np.zeros(int(seconds * rate)) if silent else 0.2 * np.sin(
        2 * np.pi * 220 * np.arange(int(seconds * rate)) / rate
    )
    output = io.BytesIO()
    sf.write(output, np.stack([samples, samples], axis=1), rate, format="WAV")
    return output.getvalue()


def test_stereo_is_resampled_to_mono_pcm():
    output, duration = normalize_audio(wav())
    info = sf.info(io.BytesIO(output))
    assert info.channels == 1 and info.samplerate == 44100
    assert duration == pytest.approx(1, abs=0.01)
    assert info.subtype == "PCM_16"


def test_webm_from_browser_is_decoded(tmp_path):
    source, target = tmp_path / "input.wav", tmp_path / "browser.webm"
    source.write_bytes(wav())
    subprocess.run([shutil.which("ffmpeg"), "-v", "error", "-i", str(source),
                    "-c:a", "libopus", str(target)], check=True)
    output, duration = normalize_audio(target.read_bytes())
    assert sf.info(io.BytesIO(output)).samplerate == 44100
    assert duration == pytest.approx(1, abs=0.05)


@pytest.mark.parametrize("data", [b"not audio", wav(0.1), wav(31), wav(silent=True)],
                         ids=["invalid", "short", "long", "silent"])
def test_invalid_short_long_and_silent_uploads_are_rejected(data):
    with pytest.raises(ValueError):
        normalize_audio(data)
