"""Command-line entry point for installing the project's default models."""
from language_setup import MODEL_PAIRS, install_language_models


if __name__ == "__main__":
    try:
        install_language_models(
            progress=lambda message: print(message, flush=True)
        )
        print("Cài đặt mô hình ngôn ngữ hoàn tất.")
    except Exception as error:
        print(f"Cài mô hình thất bại: {error}")
        print("Hãy kiểm tra kết nối Internet rồi chạy lại.")
        raise SystemExit(1)
