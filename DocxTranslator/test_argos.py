import argostranslate.package

print("Đang tải danh sách mô hình...")
argostranslate.package.update_package_index()

packages = argostranslate.package.get_available_packages()

for package in packages:
    if package.from_code == "vi" and package.to_code == "en":
        print("Tìm thấy mô hình:")
        print("Việt -> Anh")
        print("Phiên bản:", package.package_version)
        break
else:
    print("Không tìm thấy mô hình dịch Việt -> Anh.")
