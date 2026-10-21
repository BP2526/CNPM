"""HTTP interface for mobile/web frontends; artifacts are served from Result."""
import json
import os
import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from document_pipeline import RESULT_DIR, process_document_to_result
from language_setup import get_installed_model_pairs
from object_pipeline import (
    get_object,
    list_object_results,
    list_objects,
    process_object_to_result,
)

app = FastAPI(title="DocxTranslator API", version="1.1")
cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "DOCXTRANSLATOR_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {".txt", ".docx", ".pdf"}
RESULT_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/languages")
def languages():
    pairs = get_installed_model_pairs()
    return {"installed_pairs": [{"source": source, "target": target} for source, target in pairs]}


@app.get("/api/objects")
def objects():
    try:
        records = list_objects()
        return {"count": len(records), "items": records}
    except Exception as error:
        raise HTTPException(500, str(error)) from error


@app.get("/api/objects/{object_id}")
def object_detail(object_id: str):
    try:
        return get_object(object_id)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/api/objects/{object_id}/results")
def object_results(object_id: str, request: Request):
    try:
        results = list_object_results(object_id)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    base = str(request.base_url).rstrip("/")
    for item in results:
        root = f"{base}/api/objects/{object_id}/results/{item['target_language']}"
        item["manifest_url"] = root
        item["translated_json_url"] = f"{root}/translated.json"
        item["translated_text_url"] = f"{root}/translated.txt"
        item["audio_url"] = f"{root}/speech.mp3"
    return {"object_id": object_id, "items": results}


@app.post("/api/objects/{object_id}/process")
async def process_object(
    object_id: str,
    request: Request,
    source: str = Form("vi"),
    target: str = Form(...),
):
    try:
        manifest = await run_in_threadpool(process_object_to_result, object_id, source, target)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    except Exception as error:
        raise HTTPException(400, str(error)) from error
    root = f"{str(request.base_url).rstrip('/')}/api/objects/{object_id}/results/{target}"
    return {
        **manifest,
        "manifest_url": root,
        "translated_json_url": f"{root}/translated.json",
        "translated_text_url": f"{root}/translated.txt",
        "audio_url": f"{root}/speech.mp3",
    }


@app.get("/api/objects/{object_id}/results/{target_code}")
def object_result_manifest(object_id: str, target_code: str):
    try:
        get_object(object_id)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    if not re.fullmatch(r"[a-z]{2,3}", target_code):
        raise HTTPException(404, "Không tìm thấy kết quả.")
    manifest_path = RESULT_DIR / object_id / target_code / "manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(404, "Chưa có kết quả cho ngôn ngữ này.")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@app.get("/api/objects/{object_id}/results/{target_code}/{artifact}")
def object_result_artifact(object_id: str, target_code: str, artifact: str):
    try:
        get_object(object_id)
    except FileNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    if not re.fullmatch(r"[a-z]{2,3}", target_code):
        raise HTTPException(404, "Không tìm thấy kết quả.")
    media_types = {
        "translated.json": "application/json",
        "translated.txt": "text/plain; charset=utf-8",
        "speech.mp3": "audio/mpeg",
    }
    if artifact not in media_types:
        raise HTTPException(404, "Không tìm thấy tệp.")
    path = RESULT_DIR / object_id / target_code / artifact
    if not path.is_file():
        raise HTTPException(404, "Không tìm thấy tệp.")
    return FileResponse(path, media_type=media_types[artifact], filename=artifact)


@app.post("/api/process")
async def process(
    request: Request,
    file: UploadFile = File(...),
    source: str = Form(...),
    target: str = Form(...),
):
    original_name = Path(file.filename or "upload.txt").name
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Chỉ nhận TXT, DOCX hoặc PDF.")

    try:
        with tempfile.TemporaryDirectory(prefix="docxtranslator-") as temp_dir:
            input_path = Path(temp_dir) / f"upload{suffix}"
            size = 0
            with input_path.open("wb") as output:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, "File vượt quá giới hạn 25 MB.")
                    output.write(chunk)
            result = await run_in_threadpool(process_document_to_result, input_path, source, target, original_name)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(400, str(error)) from error
    finally:
        await file.close()

    base_url = str(request.base_url).rstrip("/")
    result_url = f"{base_url}/api/results/{result['job_id']}"
    return {
        "job_id": result["job_id"], "status": result["status"],
        "source_file": result["source_file"], "source_language": result["source_language"],
        "target_language": result["target_language"], "result_directory": result["result_directory"],
        "manifest_url": result_url, "translated_text_url": f"{result_url}/translated.txt",
        "audio_url": f"{result_url}/speech.mp3",
    }


def _job_directory(job_id):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(404, "Không tìm thấy kết quả.")
    job_dir = (RESULT_DIR / job_id).resolve()
    if job_dir.parent != RESULT_DIR.resolve() or not job_dir.is_dir():
        raise HTTPException(404, "Không tìm thấy kết quả.")
    return job_dir


@app.get("/api/results/{job_id}")
def get_result(job_id: str):
    manifest_path = _job_directory(job_id) / "manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(404, "Manifest chưa có.")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@app.get("/api/results/{job_id}/{artifact}")
def get_artifact(job_id: str, artifact: str):
    if artifact not in {"translated.txt", "speech.mp3"}:
        raise HTTPException(404, "Không tìm thấy tệp.")
    path = _job_directory(job_id) / artifact
    if not path.is_file():
        raise HTTPException(404, "Không tìm thấy tệp.")
    media_type = "audio/mpeg" if artifact.endswith(".mp3") else "text/plain"
    return FileResponse(path, media_type=media_type, filename=artifact)


# Serve the map from the same origin as this API so browsers can load narration without CORS setup.
MAP_DIR = Path(__file__).resolve().parent.parent / "map"
app.mount("/", StaticFiles(directory=str(MAP_DIR), html=True), name="map")
