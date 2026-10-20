import threading
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from document_pipeline import (
    RESULT_DIR,
    create_speech,
    process_text_to_result,
    read_document,
    translate_text,
)

APP_DIR = Path(__file__).resolve().parent

# Tên hiển thị: mã ngôn ngữ
LANGUAGES = {
    "Tự động phát hiện": "auto",
    "Tiếng Việt": "vi",
    "English": "en",
    "中文 (Chinese)": "zh",
    "日本語 (Japanese)": "ja",
    "한국어 (Korean)": "ko",
    "Français (French)": "fr",
    "Deutsch (German)": "de",
    "Español (Spanish)": "es",
    "Italiano (Italian)": "it",
    "Português (Portuguese)": "pt",
    "Русский (Russian)": "ru",
    "ไทย (Thai)": "th",
    "Bahasa Indonesia": "id",
    "العربية (Arabic)": "ar",
}

class TranslationTTSApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Translation + Text-to-Speech")
        self.root.geometry("1000x720")
        self.root.minsize(760, 560)

        self.current_file = None
        self.translated_text = ""

        self.source_var = tk.StringVar(value="Tiếng Việt")
        self.target_var = tk.StringVar(value="English")
        self.status_var = tk.StringVar(value="Sẵn sàng.")

        self.build_ui()

    def build_ui(self):
        self.root.geometry("1000x760")
        self.root.minsize(800, 600)

        main = ttk.Frame(self.root, padding=12)
        main.pack(fill="both", expand=True)

        # Chia giao diện thành các hàng:
        # 0: tiêu đề
        # 1: chọn ngôn ngữ
        # 2: nút mở file
        # 3: vùng văn bản đầu vào
        # 4: vùng bản dịch
        # 5: nút chức năng
        # 6: trạng thái
        main.columnconfigure(0, weight=1)
        main.rowconfigure(3, weight=1)
        main.rowconfigure(4, weight=1)

        ttk.Label(
            main, text="TRANSLATION + TEXT-TO-SPEECH", font=("Segoe UI", 16, "bold")
        ).grid(row=0, column=0, sticky="w", pady=(0, 10))

        languages_frame = ttk.Frame(main)
        languages_frame.grid(row=1, column=0, sticky="ew", pady=(0, 10))

        ttk.Label(languages_frame, text="Ngôn ngữ nguồn:").pack(side="left")

        self.source_box = ttk.Combobox(
            languages_frame,
            textvariable=self.source_var,
            values=list(LANGUAGES.keys()),
            state="readonly",
            width=20,
        )
        self.source_box.pack(side="left", padx=(6, 15))

        ttk.Label(languages_frame, text="Ngôn ngữ đích:").pack(side="left")

        self.target_box = ttk.Combobox(
            languages_frame,
            textvariable=self.target_var,
            values=[name for name, code in LANGUAGES.items() if code != "auto"],
            state="readonly",
            width=20,
        )
        self.target_box.pack(side="left", padx=6)

        file_frame = ttk.Frame(main)
        file_frame.grid(row=2, column=0, sticky="ew", pady=(0, 8))

        ttk.Button(file_frame, text="Mở TXT / DOCX / PDF", command=self.open_file).pack(
            side="left"
        )

        ttk.Button(file_frame, text="Xóa văn bản", command=self.clear_text).pack(
            side="left", padx=8
        )

        # Khung đầu vào
        input_frame = ttk.LabelFrame(main, text="Văn bản đầu vào", padding=6)
        input_frame.grid(row=3, column=0, sticky="nsew", pady=(0, 8))
        input_frame.rowconfigure(0, weight=1)
        input_frame.columnconfigure(0, weight=1)

        self.input_box = tk.Text(input_frame, wrap="word", font=("Segoe UI", 10))
        input_scroll = ttk.Scrollbar(
            input_frame, orient="vertical", command=self.input_box.yview
        )
        self.input_box.configure(yscrollcommand=input_scroll.set)
        self.input_box.grid(row=0, column=0, sticky="nsew")
        input_scroll.grid(row=0, column=1, sticky="ns")

        # Khung bản dịch
        output_frame = ttk.LabelFrame(main, text="Bản dịch", padding=6)
        output_frame.grid(row=4, column=0, sticky="nsew")
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)

        self.output_box = tk.Text(output_frame, wrap="word", font=("Segoe UI", 10))
        output_scroll = ttk.Scrollbar(
            output_frame, orient="vertical", command=self.output_box.yview
        )
        self.output_box.configure(yscrollcommand=output_scroll.set)
        self.output_box.grid(row=0, column=0, sticky="nsew")
        output_scroll.grid(row=0, column=1, sticky="ns")
        self.output_box.configure(state="disabled")

        # Các nút chức năng: luôn ở hàng riêng bên dưới
        action_frame = ttk.Frame(main)
        action_frame.grid(row=5, column=0, sticky="ew", pady=(10, 5))

        self.translate_button = ttk.Button(
            action_frame, text="Dịch văn bản", command=self.start_translation
        )
        self.translate_button.pack(side="left", padx=(0, 8))

        self.save_button = ttk.Button(
            action_frame, text="Lưu bản dịch TXT", command=self.save_translation
        )
        self.save_button.pack(side="left", padx=8)

        self.speech_button = ttk.Button(
            action_frame, text="Tạo âm thanh MP3", command=self.start_speech
        )
        self.speech_button.pack(side="left", padx=8)

        self.export_button = ttk.Button(
            action_frame,
            text="Tạo TXT + MP3 trong Result",
            command=self.start_result_export,
        )
        self.export_button.pack(side="left", padx=8)

        ttk.Label(main, textvariable=self.status_var, relief="sunken", anchor="w").grid(
            row=6, column=0, sticky="ew", pady=(4, 0)
        )

    @staticmethod
    def make_textbox(parent):
        frame = ttk.Frame(parent)
        frame.pack(fill="both", expand=True)

        box = tk.Text(frame, wrap="word", font=("Segoe UI", 10), undo=True)
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=box.yview)
        box.configure(yscrollcommand=scrollbar.set)

        box.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        return box

    def get_text(self):
        return self.input_box.get("1.0", "end-1c").strip()

    def set_output(self, text):
        self.output_box.configure(state="normal")
        self.output_box.delete("1.0", "end")
        self.output_box.insert("1.0", text)
        self.output_box.configure(state="disabled")

    def open_file(self):
        file_path = filedialog.askopenfilename(
            title="Chọn tài liệu",
            filetypes=[
                ("Tài liệu hỗ trợ", "*.txt *.docx *.pdf"),
                ("Text files", "*.txt"),
                ("Word files", "*.docx"),
                ("PDF files", "*.pdf"),
                ("All files", "*.*"),
            ],
        )

        if not file_path:
            return

        try:
            content = read_document(file_path)

            if not content.strip():
                messagebox.showwarning(
                    "Không có văn bản",
                    "Không tìm thấy văn bản đọc được trong file. "
                    "Nếu đây là PDF scan, cần bổ sung OCR.",
                )
                return

            self.input_box.delete("1.0", "end")
            self.input_box.insert("1.0", content)
            self.current_file = Path(file_path)
            self.status_var.set(f"Đã mở: {self.current_file.name}")

        except Exception as exc:
            messagebox.showerror("Lỗi đọc file", str(exc))

    def clear_text(self):
        self.input_box.delete("1.0", "end")
        self.set_output("")
        self.translated_text = ""
        self.current_file = None
        self.status_var.set("Đã xóa văn bản.")

    def start_translation(self):
        text = self.get_text()
        if not text:
            messagebox.showwarning(
                "Thiếu dữ liệu", "Hãy nhập văn bản hoặc mở một file trước."
            )
            return

        source = LANGUAGES[self.source_var.get()]
        target = LANGUAGES[self.target_var.get()]

        self.translate_button.configure(state="disabled")
        self.status_var.set("Đang dịch... Vui lòng chờ.")

        threading.Thread(
            target=self.translation_worker, args=(text, source, target), daemon=True
        ).start()

    def translation_worker(self, text, source, target):
        try:
            result = translate_text(text, source, target)
            self.root.after(0, lambda: self.translation_success(result))
        except Exception as exc:
            error = str(exc)
            self.root.after(0, lambda: self.operation_error(error))

    def translation_success(self, result):
        self.translated_text = result
        self.set_output(result)
        self.translate_button.configure(state="normal")
        self.status_var.set("Dịch hoàn tất.")

    def operation_error(self, error):
        self.translate_button.configure(state="normal")
        self.speech_button.configure(state="normal")
        if hasattr(self, "export_button"):
            self.export_button.configure(state="normal")
        self.status_var.set("Tác vụ thất bại.")
        messagebox.showerror(
            "Lỗi xử lý",
            "Không thể hoàn thành tác vụ.\n\n"
            + error
            + "\n\nHãy kiểm tra mô hình dịch đã cài, "
            "ngôn ngữ đã chọn và thử lại.",
        )

    def start_result_export(self):
        text = self.get_text()
        if not text:
            messagebox.showwarning(
                "Thiếu dữ liệu", "Hãy nhập văn bản hoặc mở một file trước."
            )
            return

        source = LANGUAGES[self.source_var.get()]
        target = LANGUAGES[self.target_var.get()]
        self.export_button.configure(state="disabled")
        self.status_var.set("Đang tạo bản dịch, MP3 và dữ liệu Result...")
        source_name = self.current_file.name if self.current_file else "input.txt"
        threading.Thread(
            target=self.result_export_worker,
            args=(text, source, target, source_name),
            daemon=True,
        ).start()

    def result_export_worker(self, text, source, target, source_name):
        try:
            result = process_text_to_result(
                text, source, target, source_filename=source_name
            )
            self.root.after(0, lambda: self.result_export_success(result))
        except Exception as exc:
            error = str(exc)
            self.root.after(0, lambda: self.operation_error(error))

    def result_export_success(self, result):
        self.translated_text = result["translated_text"]
        self.set_output(self.translated_text)
        self.export_button.configure(state="normal")
        self.status_var.set(
            f"Đã tạo dữ liệu: Result/{result['result_directory']}"
        )
        messagebox.showinfo(
            "Đã tạo dữ liệu",
            "Đã lưu bản dịch, MP3 và manifest.json trong:\n"
            + result["result_path"],
        )

    def save_translation(self):
        text = self.output_box.get("1.0", "end-1c").strip()

        if not text:
            messagebox.showwarning(
                "Chưa có bản dịch", "Hãy dịch văn bản trước khi lưu."
            )
            return

        file_path = filedialog.asksaveasfilename(
            title="Lưu bản dịch",
            initialdir=str(RESULT_DIR),
            initialfile="translated.txt",
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt")],
        )

        if not file_path:
            return

        try:
            Path(file_path).write_text(text, encoding="utf-8")
            self.status_var.set("Đã lưu bản dịch.")
        except Exception as exc:
            messagebox.showerror("Lỗi lưu file", str(exc))

    def start_speech(self):
        # Cho phép đọc cả bản dịch đã tạo và văn bản được
        # chỉnh sửa trực tiếp trong ô kết quả.
        text = self.output_box.get("1.0", "end-1c").strip()

        if not text:
            messagebox.showwarning(
                "Chưa có văn bản", "Hãy dịch văn bản trước khi tạo MP3."
            )
            return

        target = LANGUAGES[self.target_var.get()]

        file_path = filedialog.asksaveasfilename(
            title="Lưu âm thanh MP3",
            initialdir=str(RESULT_DIR),
            initialfile="speech.mp3",
            defaultextension=".mp3",
            filetypes=[("MP3 audio", "*.mp3")],
        )

        if not file_path:
            return

        self.speech_button.configure(state="disabled")
        self.status_var.set("Đang tạo âm thanh MP3...")

        threading.Thread(
            target=self.speech_worker, args=(text, target, file_path), daemon=True
        ).start()

    def speech_worker(self, text, target, file_path):
        try:
            create_speech(text, target, file_path)
            self.root.after(0, lambda: self.speech_success(file_path))
        except Exception as exc:
            error = str(exc)
            self.root.after(0, lambda: self.operation_error(error))

    def speech_success(self, file_path):
        self.speech_button.configure(state="normal")
        self.status_var.set(f"Đã tạo MP3: {file_path}")
        messagebox.showinfo("Thành công", f"Đã tạo file âm thanh:\n{file_path}")


if __name__ == "__main__":
    root = tk.Tk()
    app = TranslationTTSApp(root)
    root.mainloop()
