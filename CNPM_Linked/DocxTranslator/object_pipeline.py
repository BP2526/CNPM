"""Translate attraction records and create reusable frontend artifacts."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import tempfile

from gtts import gTTS

from document_pipeline import RESULT_DIR, translate_text

APP_DIR = Path(__file__).resolve().parent
OBJECTS_DIR = APP_DIR / "Objects"
OBJECT_RESULT_DIR = RESULT_DIR
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LANG_PATTERN = re.compile(r"^[a-z]{2,3}$")
TEXT_FIELDS = ("name", "description", "review")


def list_objects():
    """Load the source catalogue from Objects; never read synced source docs."""
    index_path = OBJECTS_DIR / "index.json"
    if not index_path.is_file():
        raise FileNotFoundError("Không tìm thấy Objects/index.json.")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    objects = []
    for entry in index.get("items", []):
        object_id = entry.get("id", "")
        if not ID_PATTERN.fullmatch(object_id):
            continue
        path = OBJECTS_DIR / f"{object_id}.json"
        if path.is_file():
            objects.append(json.loads(path.read_text(encoding="utf-8")))
    return objects


def get_object(object_id):
    if not ID_PATTERN.fullmatch(object_id):
        raise FileNotFoundError("Không tìm thấy địa điểm.")
    path = OBJECTS_DIR / f"{object_id}.json"
    if not path.is_file():
        raise FileNotFoundError("Không tìm thấy địa điểm.")
    item = json.loads(path.read_text(encoding="utf-8"))
    if item.get("id") != object_id:
        raise FileNotFoundError("Không tìm thấy địa điểm.")
    return item


def process_object_to_result(object_id, source_code="vi", target_code="en"):
    """Create Result/<object_id>/<target_code> for frontend events."""
    if not LANG_PATTERN.fullmatch(target_code) or not LANG_PATTERN.fullmatch(source_code):
        raise ValueError("Mã ngôn ngữ không hợp lệ.")
    source = get_object(object_id)
    result_dir = OBJECT_RESULT_DIR / object_id / target_code
    result_dir.mkdir(parents=True, exist_ok=True)

    translations = {}
    for field in TEXT_FIELDS:
        value = source.get(field)
        if isinstance(value, str) and value.strip():
            translations[field] = translate_text(value, source_code, target_code)
    if isinstance(source.get("address"), str):
        translations["address"] = translate_text(source["address"], source_code, target_code)

    combined_text = "\n\n".join(
        translations[field] for field in ("name", "description", "review")
        if translations.get(field)
    )
    if translations.get("address"):
        combined_text += "\n\n" + translations["address"]

    output_record = {
        "id": object_id,
        "source_language": source_code,
        "target_language": target_code,
        "original": source,
        "translated": translations,
        "image_url": source.get("image_url"),
        "image_source": source.get("image_source"),
        "image_credit": source.get("image_credit"),
    }
    translated_json = result_dir / "translated.json"
    translated_txt = result_dir / "translated.txt"
    speech_path = result_dir / "speech.mp3"
    manifest_path = result_dir / "manifest.json"

    # Build audio to a temporary file so an interrupted request cannot leave a partial MP3.
    with tempfile.NamedTemporaryFile(prefix="speech-", suffix=".mp3", dir=result_dir, delete=False) as tmp:
        temporary_audio = Path(tmp.name)
    try:
        gTTS(text=combined_text, lang=target_code).save(str(temporary_audio))
        temporary_audio.replace(speech_path)
    except Exception:
        temporary_audio.unlink(missing_ok=True)
        raise

    translated_json.write_text(json.dumps(output_record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    translated_txt.write_text(combined_text + "\n", encoding="utf-8")
    manifest = {
        "object_id": object_id,
        "name": source.get("name"),
        "status": "complete",
        "source_language": source_code,
        "target_language": target_code,
        "result_directory": f"{object_id}/{target_code}",
        "files": {
            "translated_json": "translated.json",
            "translated_text": "translated.txt",
            "audio": "speech.mp3",
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def list_object_results(object_id):
    """Return available target folders for this attraction."""
    get_object(object_id)
    parent = OBJECT_RESULT_DIR / object_id
    results = []
    if parent.is_dir():
        for child in sorted(parent.iterdir()):
            manifest = child / "manifest.json"
            if child.is_dir() and manifest.is_file():
                results.append(json.loads(manifest.read_text(encoding="utf-8")))
    return results
