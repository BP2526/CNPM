"""UI-independent document translation and Result artifact generation."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import uuid

import argostranslate.translate

from language_setup import get_installed_model_pairs
from docx import Document
from gtts import gTTS
from pypdf import PdfReader

APP_DIR = Path(__file__).resolve().parent
RESULT_DIR = APP_DIR / "Result"
RESULT_DIR.mkdir(parents=True, exist_ok=True)
CHUNK_SIZE = 4000


def split_text(text, max_length=CHUNK_SIZE):
    text = text.strip()
    chunks = []
    while text:
        if len(text) <= max_length:
            chunks.append(text)
            break
        cut = text.rfind(" ", 0, max_length)
        if cut < max_length // 2:
            cut = max_length
        chunks.append(text[:cut].strip())
        text = text[cut:].strip()
    return [chunk for chunk in chunks if chunk]


def read_document(file_path):
    """Read TXT, DOCX, or text-based PDF without depending on a frontend."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".txt":
        for encoding in ("utf-8-sig", "utf-8", "cp1252"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("Không đọc được mã hóa TXT; hãy lưu file dưới dạng UTF-8.")

    if suffix == ".docx":
        document = Document(str(path))
        return "\n".join(
            paragraph.text
            for paragraph in document.paragraphs
            if paragraph.text.strip()
        )

    if suffix == ".pdf":
        reader = PdfReader(str(path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)

    raise ValueError("Chỉ hỗ trợ file TXT, DOCX và PDF.")


def _translation_path(source_code, target_code):
    source = argostranslate.translate.get_language_from_code(source_code)
    target = argostranslate.translate.get_language_from_code(target_code)
    if source is None or target is None:
        return []

    direct = source.get_translation(target)
    if direct is not None:
        return [direct]

    # Use English as a bridge when both installed models are available.
    if source_code != "en" and target_code != "en":
        english = argostranslate.translate.get_language_from_code("en")
        if english is not None:
            to_english = source.get_translation(english)
            from_english = english.get_translation(target)
            if to_english is not None and from_english is not None:
                return [to_english, from_english]
    return []


def translate_text(text, source_code, target_code):
    if not text.strip():
        raise ValueError("Văn bản đầu vào đang trống.")
    if source_code == "auto":
        raise ValueError("Argos ngoại tuyến cần chọn ngôn ngữ nguồn cụ thể.")
    if target_code == "auto":
        raise ValueError("Hãy chọn ngôn ngữ đích cụ thể.")
    if source_code == target_code:
        return text

    path = _translation_path(source_code, target_code)
    if not path:
        pairs = ", ".join(
            f"{source} → {target}"
            for source, target in get_installed_model_pairs()
        ) or "không có"
        raise ValueError(
            f"Chưa cài mô hình cho {source_code} → {target_code}. "
            f"Các cặp hiện có: {pairs}."
        )

    results = []
    for chunk in split_text(text):
        translated = chunk
        for translation in path:
            translated = translation.translate(translated)
        results.append(translated)
    return "\n\n".join(results)


def create_speech(text, language_code, output_path):
    if not text.strip():
        raise ValueError("Không có văn bản để tạo giọng nói.")
    if language_code == "auto":
        raise ValueError("Hãy chọn ngôn ngữ đích cụ thể.")
    gTTS(text=text, lang=language_code).save(str(output_path))


def process_text_to_result(
    text, source_code, target_code, source_filename="input.txt"
):
    """Create a translated TXT, MP3, and manifest under Result/<job_id>/."""
    translated = translate_text(text, source_code, target_code)
    job_id = uuid.uuid4().hex
    job_dir = RESULT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=False)

    translated_path = job_dir / "translated.txt"
    speech_path = job_dir / "speech.mp3"
    temporary_speech_path = job_dir / "speech.part.mp3"

    try:
        create_speech(translated, target_code, temporary_speech_path)
        translated_path.write_text(translated, encoding="utf-8")
        temporary_speech_path.replace(speech_path)

        manifest = {
            "job_id": job_id,
            "status": "complete",
            "source_file": Path(source_filename).name,
            "source_language": source_code,
            "target_language": target_code,
            "files": {
                "translated_text": "translated.txt",
                "audio": "speech.mp3",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        (job_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        temporary_speech_path.unlink(missing_ok=True)
        translated_path.unlink(missing_ok=True)
        job_dir.rmdir()
        raise

    return {
        **manifest,
        "result_path": str(job_dir),
        "result_directory": job_id,
        "translated_txt": f"{job_id}/translated.txt",
        "speech_mp3": f"{job_id}/speech.mp3",
        "manifest_path": f"{job_id}/manifest.json",
        "translated_text": translated,
    }


def process_document_to_result(
    file_path, source_code, target_code, source_filename=None
):
    path = Path(file_path)
    return process_text_to_result(
        read_document(path),
        source_code,
        target_code,
        source_filename=source_filename or path.name,
    )
