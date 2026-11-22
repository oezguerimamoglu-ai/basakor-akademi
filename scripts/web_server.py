#!/usr/bin/env python3
"""Serve BasAkor Akademi and its private, Codespaces-backed MP3 analysis API."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
ANALYZER = ROOT / "scripts" / "analyze_audio.py"
JOB_ROOT = Path(tempfile.gettempdir()) / "basakor-akademi-mp3-jobs"
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.mjs": ("app.mjs", "text/javascript; charset=utf-8"),
    "/music.mjs": ("music.mjs", "text/javascript; charset=utf-8"),
    "/midi-file.mjs": ("midi-file.mjs", "text/javascript; charset=utf-8"),
    "/midi-player.mjs": ("midi-player.mjs", "text/javascript; charset=utf-8"),
    "/manifest.webmanifest": ("manifest.webmanifest", "application/manifest+json"),
    "/sw.js": ("sw.js", "text/javascript; charset=utf-8"),
    "/icon.svg": ("icon.svg", "image/svg+xml"),
    "/icon-192.png": ("icon-192.png", "image/png"),
    "/icon-512.png": ("icon-512.png", "image/png"),
}
JOBS: dict[str, dict[str, object]] = {}
JOBS_LOCK = threading.Lock()
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
DOWNLOADS = {
    "bass-wav": "bass.wav",
    "drums-wav": "drums.wav",
    "vocals-wav": "vocals.wav",
    "other-wav": "other.wav",
    "bass-midi": "bass_basic_pitch.mid",
    "practice-midi": "practice.mid",
    "chords": "chords.txt",
    "chords-csv": "chords.csv",
    "report": "music-analysis.json",
}


def _analysis_dir(job: dict[str, object]) -> Path:
    return Path(str(job["job_dir"])) / "analysis" / "upload"


def _snapshot(job_id: str) -> dict[str, object] | None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return None
        return {
            key: value
            for key, value in job.items()
            if key not in ("job_dir", "audio_path", "log_lines")
        }


def _run_analysis(job_id: str) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["status"] = "running"
        job["progress"] = 2
        job["stage"] = "Analiz başlatılıyor"
        audio_path = Path(str(job["audio_path"]))
        output_dir = Path(str(job["job_dir"])) / "analysis"

    command = [
        sys.executable,
        str(ANALYZER),
        str(audio_path),
        "--output",
        str(output_dir),
    ]
    try:
        process = subprocess.Popen(
            command,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        assert process.stdout is not None
        for raw_line in process.stdout:
            line = raw_line.strip()
            if not line:
                continue
            with JOBS_LOCK:
                current = JOBS.get(job_id)
                if not current:
                    continue
                log_lines = current["log_lines"]
                assert isinstance(log_lines, list)
                log_lines.append(line)
                del log_lines[:-12]
                if "1/4 Demucs:" in line:
                    current.update(progress=8, stage="Bas, davul, vokal ve eşlik ayrılıyor")
                elif "2/4 Basic Pitch:" in line:
                    current.update(progress=72, stage="Bas çizgisi MIDI'ye çevriliyor")
                elif "3/4 BeatNetLite:" in line:
                    current.update(progress=86, stage="Tempo ve ölçü tahmin ediliyor")
                elif "4/4 Librosa:" in line:
                    current.update(progress=94, stage="Akorlar analiz ediliyor")

        return_code = process.wait()
        if return_code != 0:
            raise RuntimeError(f"Analiz işlemi {return_code} koduyla tamamlanmadı.")

        result_dir = _analysis_dir(JOBS[job_id])
        report_path = result_dir / "music-analysis.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        tempo = report["tempo_and_meter"]
        midi_path = result_dir / "practice.mid"
        if not midi_path.is_file():
            raise FileNotFoundError("Bas + akor çalışma MIDI dosyası oluşturulamadı.")

        result = {
            "file_name": JOBS[job_id]["original_name"],
            "tempo_bpm": tempo["tempo_bpm"],
            "time_signature": tempo["time_signature_estimate"],
            "beat_count": tempo["beat_count"],
            "chord_count": len(report.get("chord_segments", [])),
            "chord_segments": report.get("chord_segments", []),
            "practice_midi_url": f"/api/jobs/{job_id}/download/practice-midi",
            "bass_wav_url": f"/api/jobs/{job_id}/download/bass-wav",
            "bass_midi_url": f"/api/jobs/{job_id}/download/bass-midi",
            "chords_url": f"/api/jobs/{job_id}/download/chords",
            "report_url": f"/api/jobs/{job_id}/download/report",
        }
        with JOBS_LOCK:
            job = JOBS[job_id]
            job.update(
                status="completed",
                progress=100,
                stage="Analiz tamamlandı",
                message="Bas MIDI'si ve tahmini piano akorları hazır.",
                result=result,
            )
    except Exception as error:
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if not job:
                return
            logs = job.get("log_lines", [])
            details = "\n".join(logs[-8:]) if isinstance(logs, list) else ""
            job.update(
                status="failed",
                progress=0,
                stage="Analiz tamamlanamadı",
                error=str(error),
                details=details[-3000:],
            )


class Handler(BaseHTTPRequestHandler):
    server_version = "BasAkorCodespaces/1.0"

    def log_message(self, _format: str, *args: object) -> None:
        return

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str, *, download_name: str | None = None) -> None:
        if not path.is_file():
            self._send_json(404, {"error": "Dosya bulunamadı."})
            return
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        if download_name:
            ascii_name = download_name.encode("ascii", "replace").decode("ascii").replace('"', "")
            encoded_name = quote(download_name.replace("/", "_"), safe="")
            self.send_header(
                "Content-Disposition",
                "attachment; filename=\"" + ascii_name + "\"; filename*=UTF-8''" + encoded_name,
            )
        self.end_headers()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                self.wfile.write(chunk)

    def _same_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        request_host = self.headers.get("Host", "").lower()
        origin_host = urlsplit(origin).netloc.lower()
        return bool(request_host) and request_host == origin_host

    def do_GET(self) -> None:
        route = unquote(urlsplit(self.path).path)
        if route == "/api/health":
            self._send_json(
                200,
                {
                    "service": "basakor-akademi-audio",
                    "max_upload_bytes": MAX_UPLOAD_BYTES,
                },
            )
            return

        job_match = re.fullmatch(r"/api/jobs/([a-f0-9]{32})", route)
        if job_match:
            snapshot = _snapshot(job_match.group(1))
            self._send_json(200, snapshot) if snapshot else self._send_json(404, {"error": "İş bulunamadı."})
            return

        download_match = re.fullmatch(
            r"/api/jobs/([a-f0-9]{32})/download/([a-z-]+)",
            route,
        )
        if download_match:
            job_id, kind = download_match.groups()
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            if not job or job.get("status") != "completed":
                self._send_json(404, {"error": "Hazır analiz dosyası bulunamadı."})
                return
            file_name = DOWNLOADS.get(kind)
            if not file_name:
                self._send_json(404, {"error": "İstenen dosya türü desteklenmiyor."})
                return
            result_dir = _analysis_dir(job)
            if kind.endswith("-wav"):
                track_dir = result_dir / "stems" / "htdemucs" / "upload"
                path = track_dir / file_name
            elif kind == "bass-midi":
                path = result_dir / "midi" / file_name
            else:
                path = result_dir / file_name
            content_type = (
                "audio/midi"
                if path.suffix.lower() in (".mid", ".midi")
                else mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            )
            display_name = str(job["original_name"])
            if kind == "bass-wav":
                download_name = f"{Path(display_name).stem}_bass.wav"
            elif kind == "practice-midi":
                download_name = f"{Path(display_name).stem}_bas_akor.mid"
            else:
                download_name = file_name
            self._send_file(path, content_type, download_name=download_name)
            return

        if route.startswith("/assets/"):
            relative = Path(route.removeprefix("/assets/"))
            if not relative.parts or any(part in ("", ".", "..") for part in relative.parts):
                self._send_json(404, {"error": "Dosya bulunamadı."})
                return
            assets_root = (ROOT / "assets").resolve()
            path = (assets_root / relative).resolve()
            if not path.is_relative_to(assets_root) or path.suffix.lower() not in (".wav", ".png", ".svg"):
                self._send_json(404, {"error": "Dosya bulunamadı."})
                return
            self._send_file(path, mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            return

        static = STATIC_FILES.get(route)
        if static:
            relative, content_type = static
            self._send_file(ROOT / relative, content_type)
            return
        self._send_json(404, {"error": "Sayfa bulunamadı."})

    def do_POST(self) -> None:
        route = urlsplit(self.path)
        if route.path != "/api/analyze":
            self._send_json(404, {"error": "API yolu bulunamadı."})
            return
        if not self._same_origin():
            self._send_json(403, {"error": "Yalnızca aynı Codespace sayfasından yükleme yapılabilir."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length < 1:
            self._send_json(411, {"error": "Boş dosya gönderildi."})
            return
        if content_length > MAX_UPLOAD_BYTES:
            self._send_json(413, {"error": "Dosya 100 MB sınırını aşıyor."})
            return

        params = parse_qs(route.query)
        original_name = Path(unquote(params.get("filename", ["song.mp3"])[0])).name
        extension = Path(original_name).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            self._send_json(415, {"error": "MP3, WAV, FLAC, M4A, AAC veya OGG seç."})
            return

        with JOBS_LOCK:
            if any(job.get("status") in ("uploading", "queued", "running") for job in JOBS.values()):
                self._send_json(409, {"error": "Şu anda başka bir MP3 analizi çalışıyor."})
                return
            job_id = uuid.uuid4().hex
            job_dir = JOB_ROOT / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            audio_path = job_dir / f"upload{extension}"
            JOBS[job_id] = {
                "job_id": job_id,
                "status": "uploading",
                "progress": 0,
                "stage": "Dosya Codespace'e yükleniyor",
                "message": "",
                "original_name": original_name,
                "audio_path": str(audio_path),
                "job_dir": str(job_dir),
                "log_lines": [],
            }

        try:
            remaining = content_length
            with audio_path.open("wb") as destination:
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ConnectionError("Dosya yüklemesi yarıda kaldı.")
                    destination.write(chunk)
                    remaining -= len(chunk)
        except Exception as error:
            with JOBS_LOCK:
                JOBS.pop(job_id, None)
            self._send_json(400, {"error": str(error)})
            return

        with JOBS_LOCK:
            JOBS[job_id]["status"] = "queued"
            JOBS[job_id]["progress"] = 1
        self._send_json(202, {"job_id": job_id, "status": "queued"})
        threading.Thread(target=_run_analysis, args=(job_id,), daemon=True).start()


def main() -> None:
    host = os.environ.get("BASAKOR_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8765"))
    JOB_ROOT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"BasAkor Akademi Codespace sunucusu hazır: http://{host}:{port}")
    print("MP3 analiz portunu Codespaces'te Private bırakın.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSunucu durduruldu.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
