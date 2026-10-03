"""Small persistent job/history store; each thread owns its SQLite connection."""
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "studio.sqlite3"
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, document TEXT NOT NULL)")
            # No task survives a process restart; do not leave an endless spinner in history.
            for (raw,) in db.execute("SELECT document FROM jobs").fetchall():
                job = json.loads(raw)
                if job["status"] not in {"completed", "failed", "cancelled"}:
                    job.update(status="failed", error="Le service a redémarré pendant ce travail.")
                    db.execute("UPDATE jobs SET document=? WHERE id=?", (json.dumps(job), job["id"]))

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def create(self, kind: str, payload: dict) -> dict:
        job = {"id": uuid4().hex, "kind": kind, "status": "queued", "created_at": now(),
               "payload": payload, "result": None, "error": None, "generated_frames": 0}
        with self.connect() as db:
            db.execute("INSERT INTO jobs VALUES (?, ?)", (job["id"], json.dumps(job)))
        return job

    def get(self, job_id: str) -> dict | None:
        with self.connect() as db:
            row = db.execute("SELECT document FROM jobs WHERE id=?", (job_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def update(self, job_id: str, **changes) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT document FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not row:
                raise KeyError(job_id)
            job = json.loads(row[0])
            job.update(changes)
            db.execute("UPDATE jobs SET document=? WHERE id=?", (json.dumps(job), job_id))
        return job

    def history(self, limit: int = 50) -> list[dict]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT document FROM jobs WHERE json_extract(document, '$.kind')='generation' "
                "ORDER BY rowid DESC LIMIT ?", (limit,),
            ).fetchall()
        return [json.loads(raw) for (raw,) in rows]

    def delete(self, job_id: str):
        with self.connect() as db:
            db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
