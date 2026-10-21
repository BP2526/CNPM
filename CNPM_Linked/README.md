# CNPM: Bản đồ + DocxTranslator

Bản tích hợp độc lập này nối bản đồ với API DocxTranslator và các thuyết minh MP3 cho 11 địa điểm trong `DocxTranslator/Objects`. Dữ liệu JSON, bản dịch và MP3 được giữ thành các tệp trong `DocxTranslator/Objects` và `DocxTranslator/Result`; bản demo không cần database.

## Cài đặt trên Windows

1. Cài Python và bảo đảm lệnh `py` có trong PowerShell.
2. Tại thư mục này, chạy `powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1`. Bước này cài thư viện và tải mô hình Argos lần đầu; cần Internet.
3. Chạy `powershell -ExecutionPolicy Bypass -File .\run_local.ps1`. Mở `http://localhost:8000`.

Bản đồ lấy danh sách địa điểm từ DocxTranslator. Với các địa điểm khớp dữ liệu, nút thuyết minh phát MP3 theo ngôn ngữ đã chọn (English, 中文, Tiếng Việt). Nếu chưa có kết quả ngôn ngữ đó, API tạo kết quả và lưu vào `Result`. Quá trình dịch Argos chạy cục bộ sau khi mô hình cài xong; tạo MP3 bằng gTTS cần Internet. Các địa điểm không khớp bộ 11 địa điểm vẫn có thuyết minh tiếng Việt bằng giọng đọc trình duyệt.

## Truy cập từ điện thoại/máy khác cùng Wi-Fi

Chạy server trên máy tính chính, mở cổng TCP 8000 qua Windows Firewall trên mạng riêng, rồi truy cập `http://IP-máy-tính:8000` từ thiết bị khác. Không dùng `localhost` trên điện thoại. Nếu cần định vị GPS trên thiết bị di động, trình duyệt có thể yêu cầu HTTPS.

Chỉ dùng trong mạng tin cậy; chưa cấu hình đăng nhập hay bảo vệ API khỏi người dùng khác trong mạng. Các file trong thư mục gốc `CNPM` không bị sửa.
