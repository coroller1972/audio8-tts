import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .audio import normalize_audio
from .config import DATA_DIR, MAX_UPLOAD, MODEL_DIR, ROOT, THREADS
from .engine import Engine


class Parameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    temperature: float = Field(0.7, ge=0.05, le=2)
    top_p: float = Field(0.9, ge=0.05, le=1)
    top_k: int = Field(50, ge=1, le=4096)
    max_new_tokens: int = Field(512, ge=1, le=2048)
    seed: int | None = Field(42, ge=0, le=4294967295)


class Generation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4000)
    voice_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    parameters: Parameters = Field(default_factory=Parameters)

    @field_validator("text")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Le texte ne peut pas être vide.")
        return value.strip()


def create_app(model_dir: Path = MODEL_DIR, data_dir: Path = DATA_DIR,
               threads: int = THREADS, engine_factory=Engine):
    @asynccontextmanager
    async def lifespan(app):
        engine = engine_factory(model_dir, data_dir, threads)
        app.state.engine = engine
        engine.start()
        yield
        await run_in_threadpool(engine.close)

    app = FastAPI(title="Audio8 Studio", lifespan=lifespan)

    def engine():
        return app.state.engine

    def valid_id(value):
        if not re.fullmatch(r"[a-f0-9]{32}", value):
            raise HTTPException(404, "Élément introuvable.")

    def get_job(job_id):
        valid_id(job_id)
        job = engine().store.get(job_id)
        if job is None:
            raise HTTPException(404, "Travail introuvable.")
        return job

    @app.get("/api/health")
    def health():
        return engine().health()

    @app.get("/api/voices")
    def voices():
        return engine().voices()

    @app.post("/api/voices", status_code=202)
    async def register(audio: Annotated[UploadFile, File()], label: Annotated[str, Form()],
                       reference_text: Annotated[str, Form()]):
        label, reference_text = label.strip(), reference_text.strip()
        if not label or len(label) > 64 or not reference_text or len(reference_text) > 2000:
            raise HTTPException(422, "Indiquez un nom (64 caractères max.) et la transcription exacte.")
        if not engine().registration().status()["available"]:
            raise HTTPException(503, "L’encodeur vocal n’est pas installé ou est incompatible.")
        data = await audio.read(MAX_UPLOAD + 1)
        await audio.close()
        try:
            normalized, duration = await run_in_threadpool(normalize_audio, data)
            return engine().submit("registration", {"voice_id": uuid4().hex, "label": label,
                "reference_text": reference_text, "duration": duration}, normalized)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post("/api/generations", status_code=202)
    def generate(request: Generation):
        if request.voice_id not in {v["name"] for v in engine().voices()}:
            raise HTTPException(404, "Choisissez une voix enregistrée.")
        try:
            return engine().submit("generation", request.model_dump())
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str):
        return get_job(job_id)

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        job = get_job(job_id)
        if job["kind"] != "generation":
            raise HTTPException(409, "La création d’une voix ne peut pas être annulée.")
        engine().cancel(job_id)
        return get_job(job_id)

    @app.get("/api/recordings")
    def recordings():
        return engine().store.history()

    @app.get("/api/recordings/{job_id}/audio")
    def audio(job_id: str):
        job = get_job(job_id)
        path = engine().outputs_dir / f"{job_id}.wav"
        if job["status"] != "completed" or job["kind"] != "generation" or not path.exists():
            raise HTTPException(404, "Enregistrement indisponible.")
        return FileResponse(path, media_type="audio/wav", filename=f"audio8-{job_id[:8]}.wav")

    @app.get("/api/recordings/{job_id}/metadata")
    def metadata(job_id: str):
        job = get_job(job_id)
        if job["kind"] != "generation":
            raise HTTPException(404, "Enregistrement introuvable.")
        # Returning JSON via a downloadable file is unnecessary; Response preserves exact data.
        from fastapi.responses import Response
        return Response(json.dumps(job, ensure_ascii=False, indent=2), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="audio8-{job_id[:8]}.json"'})

    @app.delete("/api/recordings/{job_id}", status_code=204)
    def delete_recording(job_id: str):
        job = get_job(job_id)
        if job["kind"] != "generation" or job["status"] not in {"completed", "failed", "cancelled"}:
            raise HTTPException(409, "Attendez la fin de ce travail avant de le supprimer.")
        (engine().outputs_dir / f"{job_id}.wav").unlink(missing_ok=True)
        engine().store.delete(job_id)

    # The production build and API share an origin, including in a Docker Space.
    if (ROOT / "dist").exists():
        app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="spa")
    return app


app = create_app()
