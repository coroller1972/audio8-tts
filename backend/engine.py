import gc
import json
import logging
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

from .config import MODEL_ID
from .store import Store
from .third_party.arktts_runtime.registration import VoiceRegistration
from .third_party.arktts_runtime.runtime import ArkTtsRuntime
from .third_party.arktts_runtime.voices import VoiceStore

log = logging.getLogger(__name__)


class Engine:
    def __init__(self, model_dir: Path, data_dir: Path, threads: int):
        self.model_dir, self.data_dir, self.threads = model_dir, data_dir, threads
        self.voices_dir = data_dir / "voices"
        self.outputs_dir = data_dir / "outputs"
        self.uploads_dir = data_dir / "uploads"
        for folder in (self.voices_dir, self.outputs_dir, self.uploads_dir):
            folder.mkdir(parents=True, exist_ok=True)
        self.store = Store(data_dir)
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="audio8")
        self.runtime = None
        self.state = "loading"
        self.error = None
        self.lock = threading.Lock()
        self.events: dict[str, threading.Event] = {}
        self.manifest = {}
        self.revision = None

    def start(self):
        self.pool.submit(self.load)

    def load(self):
        with self.lock:
            self.state, self.error = "loading", None
        try:
            manifest_path = self.model_dir / "runtime_manifest.json"
            if not manifest_path.exists():
                raise FileNotFoundError("Le modèle n’est pas installé. Lancez npm run setup.")
            self.manifest = json.loads(manifest_path.read_text())
            revision_file = self.model_dir / "studio_revision.json"
            if revision_file.exists():
                self.revision = json.loads(revision_file.read_text()).get("revision")
            if self.runtime is None:
                self.runtime = ArkTtsRuntime(self.model_dir, self.voices_dir, threads=self.threads)
            with self.lock:
                self.state = "ready"
        except Exception as exc:
            log.exception("Model loading failed")
            with self.lock:
                self.state = "missing" if isinstance(exc, FileNotFoundError) else "error"
                self.error = str(exc)

    def registration(self):
        return VoiceRegistration(
            self.model_dir / "registration", self.voices_dir,
            self.manifest.get("model_fingerprint", ""),
        )

    def voices(self):
        return VoiceStore(self.voices_dir, self.manifest.get("num_codebooks", 10)).list()

    def health(self):
        with self.lock:
            state, error, active = self.state, self.error, len(self.events)
        return {"state": state, "error": error, "model_id": MODEL_ID, "revision": self.revision,
                "precision": "int4", "sample_rate": self.manifest.get("sample_rate", 44100),
                "threads": self.threads, "pending_jobs": active,
                "registration_available": self.registration().status()["available"],
                "parameters": {"temperature": 0.7, "top_p": 0.9, "top_k": 50,
                               "max_new_tokens": 512, "seed": 42}, "sampling": "always"}

    def submit(self, kind: str, payload: dict, audio: bytes | None = None):
        with self.lock:
            if self.state != "ready":
                raise RuntimeError(self.error or "Le modèle est en cours de chargement.")
            if len(self.events) >= 8:
                raise RuntimeError("La file est pleine. Attendez la fin des travaux en cours.")
            job = self.store.create(kind, payload)
            event = threading.Event()
            self.events[job["id"]] = event
            if audio is not None:
                try:
                    (self.uploads_dir / f"{job['id']}.wav").write_bytes(audio)
                except Exception:
                    self.events.pop(job["id"])
                    self.store.delete(job["id"])
                    raise
            self.pool.submit(self.run, job, event)
        return job

    def run(self, job: dict, event: threading.Event):
        job_id = job["id"]
        started = time.monotonic()
        try:
            if event.is_set():
                self.store.update(job_id, status="cancelled")
                return
            self.store.update(job_id, status="running", started_at=time.time())
            if job["kind"] == "registration":
                result = self.register(job)
            else:
                result = self.generate(job, event)
            if event.is_set():
                (self.outputs_dir / f"{job_id}.wav").unlink(missing_ok=True)
                self.store.update(job_id, status="cancelled")
            else:
                self.store.update(job_id, status="completed", result=result,
                                  elapsed_seconds=round(time.monotonic() - started, 3))
        except Exception as exc:
            log.exception("Job %s failed", job_id)
            (self.outputs_dir / f"{job_id}.wav").unlink(missing_ok=True)
            self.store.update(job_id, status="cancelled" if event.is_set() else "failed",
                              error=None if event.is_set() else str(exc))
        finally:
            (self.uploads_dir / f"{job_id}.wav").unlink(missing_ok=True)
            with self.lock:
                self.events.pop(job_id, None)

    def register(self, job):
        # Keep peak RAM bounded: encoding and synthesis sessions never coexist.
        self.runtime = None
        gc.collect()
        payload = job["payload"]
        try:
            meta = self.registration().register(
                (self.uploads_dir / f"{job['id']}.wav").read_bytes(), "reference.wav",
                payload["reference_text"], payload["voice_id"], False,
            )
            voice_dir = self.voices_dir / payload["voice_id"]
            meta.update(label=payload["label"], duration=payload["duration"])
            (voice_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
            return meta
        finally:
            self.load()

    def generate(self, job, event):
        if self.runtime is None:
            self.load()
        if self.runtime is None:
            raise RuntimeError(self.error or "Chargement du modèle impossible.")
        runtime = self.runtime
        payload = job["payload"]
        settings = payload["parameters"]
        seed = settings["seed"] if settings["seed"] is not None else secrets.randbelow(2**32)
        settings = {**settings, "seed": seed}
        codes, meta = runtime.voices.load(payload["voice_id"])
        prompt = runtime.prompt_builder.build(payload["text"], meta["reference_text"], codes)
        remaining = int(runtime.manifest["max_seq_len"]) - int(prompt.shape[2])
        if remaining < 1:
            raise ValueError("Le texte et la référence dépassent le contexte. Raccourcissez-les.")
        limit = min(settings["max_new_tokens"], remaining)
        self.store.update(job["id"], payload={**payload, "parameters": settings}, token_budget=limit)
        frames = []
        last_update = 0
        for frame in runtime.iter_codes(text=payload["text"], voice=payload["voice_id"],
                                        **settings, stop_event=event):
            frames.append(frame)
            if time.monotonic() - last_update > 1:
                self.store.update(job["id"], generated_frames=len(frames))
                last_update = time.monotonic()
        if event.is_set():
            return None
        if not frames:
            raise RuntimeError("Le modèle n’a produit aucun audio. Essayez une autre seed.")
        self.store.update(job["id"], status="decoding", generated_frames=len(frames))
        waveform = runtime.decode_codes(np.stack(frames, axis=1))
        if not np.isfinite(waveform).all():
            raise RuntimeError("Le modèle a produit un audio invalide. Essayez une autre seed.")
        rate = int(runtime.manifest["sample_rate"])
        sf.write(self.outputs_dir / f"{job['id']}.wav", waveform, rate, subtype="PCM_16")
        return {"audio_url": f"/api/recordings/{job['id']}/audio", "duration": len(waveform) / rate,
                "sample_rate": rate, "voice_label": meta.get("label", meta["name"]),
                "model_id": MODEL_ID, "model_revision": self.revision, "parameters": settings,
                "truncated": len(frames) >= limit, "frames": len(frames)}

    def cancel(self, job_id):
        with self.lock:
            event = self.events.get(job_id)
            if event is None:
                return False
            event.set()
        return True

    def close(self):
        with self.lock:
            for event in self.events.values():
                event.set()
        self.pool.shutdown(wait=True, cancel_futures=False)
