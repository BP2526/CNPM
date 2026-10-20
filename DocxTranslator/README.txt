DocxTranslator - cai dat va chay

Kien truc
- language_setup.py: cai dat va liet ke cac cap mo hinh Argos.
- install_argos_models.py: lenh cai mo hinh mac dinh.
- document_pipeline.py: doc TXT/DOCX/PDF, dich ngoai tuyen, tao MP3 va ghi Result/<job_id>/.
- object_pipeline.py: doc Objects/*.json, dich cac truong dia diem va tao bo ket qua theo object/ngon ngu.
- process_objects.py: tao san ket qua cho tat ca Objects (mac dinh English va Chinese).
- api.py: HTTP API cho frontend web/mobile.
- main.py: giao dien Tkinter cho desktop.

Cai tren Windows
1. Cai Python va danh dau Add Python to PATH.
2. Mo PowerShell tai thu muc du an, chay:
   py -m pip install -r requirements.txt
   py install_argos_models.py
3. Chay giao dien desktop:
   py main.py

Cac cap mo hinh mac dinh
Bo cai dat tai vi->en, en->zh, zh->en, en->vi. Cac cap nay ho tro Viet-Trung hai chieu qua tieng Anh. Can Internet de cai thu vien va tai mo hinh lan dau; sau do Argos dich ngoai tuyen. Tao MP3 qua gTTS can Internet.

Tao truoc ket qua cho cac Object
Chay trong thu muc du an:
   py process_objects.py
Lenh mac dinh xu ly tat ca Objects cho target en va zh. Co the chi dinh ngon ngu dich:
   py process_objects.py --targets en
   py process_objects.py --targets en zh
Moi ket qua nam tai Result/<object-id>/<target-code>/ va gom:
- translated.json: ban ghi goc kem cac truong da dich va URL anh.
- translated.txt: noi dung phuc vu doc.
- speech.mp3: am thanh TTS.
- manifest.json: trang thai va danh sach tep.

API cho frontend/mobile
Chay backend tren may chu:
   py -m uvicorn api:app --host 0.0.0.0 --port 8000

Danh sach va event Object:
- GET /api/objects: danh sach dia diem trong Objects.
- GET /api/objects/{object_id}: chi tiet Object goc.
- POST /api/objects/{object_id}/process: frontend gui multipart form source=vi, target=en (hoac zh); backend dich va tao JSON/TXT/MP3 trong Result/<object-id>/<target-code>/, tra ve cac URL ket qua.
- GET /api/objects/{object_id}/results: liet ke cac ngon ngu da tao va URL artifact.
- GET /api/objects/{object_id}/results/{target}: doc manifest.
- GET /api/objects/{object_id}/results/{target}/translated.json
- GET /api/objects/{object_id}/results/{target}/translated.txt
- GET /api/objects/{object_id}/results/{target}/speech.mp3

Vi du JavaScript xu ly click:
   const form = new FormData();
   form.append("source", "vi");
   form.append("target", "en");
   const response = await fetch(`${API}/api/objects/dinh-doc-lap/process`, { method: "POST", body: form });
   const result = await response.json();
   const data = await fetch(result.translated_json_url).then(r => r.json());
   audioElement.src = result.audio_url;

API chi phuc vu tep artifact tu Result. Mobile can dung IP LAN/server cua backend, khong dung localhost cua dien thoai. Chi chay trong mang tin cay; khong public backend len Internet neu chua them xac thuc va gioi han truy cap.

Ghi chu
- Tkinter chi danh cho desktop. Mobile frontend goi API Python dang chay tren may chu/server.
- PDF scan can OCR; pipeline hien tai chi trich xuat lop van ban.
- Anh trong Objects duoc giu nguyen URL nguon trong translated.json; frontend nen hien thi image_url va image_credit.
