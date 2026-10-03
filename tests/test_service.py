import threading
import time
from typing import ClassVar

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.engine import Engine
from backend.store import Store

VOICE = "a" * 32


class FakeRuntime:
    manifest: ClassVar[dict] = {"max_seq_len": 16, "sample_rate": 44100}
    voices = type("Voices", (), {"load": lambda self, name: (
        np.zeros((10, 2)), {"name": VOICE, "label": "Test", "reference_text": "Bonjour"}
    )})()
    prompt_builder = type("Prompt", (), {"build": lambda self, *args: np.zeros((1, 11, 6))})()

    def iter_codes(self, **kwargs):
        for _ in range(min(kwargs["max_new_tokens"], 10)):
            if kwargs["stop_event"].is_set():
                return
            yield np.ones(10, dtype=np.int64)

    def decode_codes(self, codes):
        return 0.1 * np.sin(np.arange(codes.shape[1] * 2048) * 0.1)


class TestEngine(Engine):
    __test__ = False

    def load(self):
        self.runtime = FakeRuntime()
        self.manifest = {"num_codebooks": 10, "sample_rate": 44100}
        self.state = "ready"

    def registration(self):
        return type("Registration", (), {"status": lambda self: {"available": True}})()

    def voices(self):
        return [{"name": VOICE, "label": "Test"}]


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "model", tmp_path / "data", engine_factory=TestEngine)
    with TestClient(app) as client:
        for _ in range(100):
            if client.get("/api/health").json()["state"] == "ready":
                break
            time.sleep(0.01)
        yield client


def finish(client, job_id):
    for _ in range(200):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in {"completed", "failed", "cancelled"}:
            return job
        time.sleep(0.01)
    pytest.fail("Job did not finish")


def test_generation_preserves_effective_settings_and_serves_real_wav(client):
    response = client.post("/api/generations", json={"text": "Bonjour", "voice_id": VOICE,
                           "parameters": {"seed": None, "max_new_tokens": 20}})
    assert response.status_code == 202
    job = finish(client, response.json()["id"])
    assert job["status"] == "completed"
    assert isinstance(job["result"]["parameters"]["seed"], int)
    assert job["payload"]["parameters"]["seed"] == job["result"]["parameters"]["seed"]
    assert job["token_budget"] == 10 and job["result"]["truncated"]
    wav_response = client.get(job["result"]["audio_url"])
    assert wav_response.content.startswith(b"RIFF")
    assert wav_response.headers["content-type"] == "audio/wav"
    metadata = client.get(f"/api/recordings/{job['id']}/metadata")
    assert metadata.json()["result"]["parameters"] == job["result"]["parameters"]
    assert client.delete(f"/api/recordings/{job['id']}").status_code == 204
    assert client.get(job["result"]["audio_url"]).status_code == 404


@pytest.mark.parametrize("changes", [{"text": " "}, {"voice_id": "../secret"},
    {"parameters": {"seed": -1}}, {"parameters": {"temperature": 0}},
    {"parameters": {"top_k": 4097}}, {"parameters": {"do_sample": False}}])
def test_request_limits_and_unsupported_options_are_enforced(client, changes):
    assert client.post("/api/generations", json={"text": "Bonjour", "voice_id": VOICE,
                       **changes}).status_code == 422


def test_unknown_voice_is_rejected(client):
    assert client.post("/api/generations", json={"text": "Bonjour", "voice_id": "b" * 32}).status_code == 404


def test_cancelled_queued_work_does_not_run(tmp_path):
    engine = TestEngine(tmp_path, tmp_path / "data", 1)
    engine.load()
    blocker = threading.Event()
    engine.pool.submit(blocker.wait)
    job = engine.submit("generation", {"text": "Bonjour", "voice_id": VOICE, "parameters": {
        "temperature": 0.7, "top_p": 0.9, "top_k": 50, "max_new_tokens": 10, "seed": 42}})
    assert engine.cancel(job["id"])
    blocker.set()
    engine.close()
    assert engine.store.get(job["id"])["status"] == "cancelled"
    assert not list(engine.outputs_dir.iterdir())


def test_restart_marks_unfinished_work_failed(tmp_path):
    store = Store(tmp_path)
    job = store.create("generation", {})
    store.update(job["id"], status="running")
    restarted = Store(tmp_path)
    assert restarted.get(job["id"])["status"] == "failed"
    assert "redémarré" in restarted.get(job["id"])["error"]


def test_history_survives_restart(tmp_path):
    store = Store(tmp_path)
    job = store.create("generation", {"text": "Bonjour"})
    store.update(job["id"], status="completed", result={"duration": 1})
    restarted = Store(tmp_path)
    assert restarted.history()[0]["payload"]["text"] == "Bonjour"
