"""Argos model installation and inventory, independent of any UI."""
import argostranslate.package as argos_package
import argostranslate.translate as argos_translate

MODEL_PAIRS = (
    ("vi", "en"),
    ("en", "zh"),
    ("zh", "en"),
    ("en", "vi"),
)


def get_installed_model_pairs():
    languages = argos_translate.get_installed_languages()
    return sorted(
        (source.code, target.code)
        for source in languages
        for target in languages
        if source.get_translation(target) is not None
    )


def install_language_models(model_pairs=MODEL_PAIRS, progress=None):
    """Install requested pairs; internet is needed only for this setup step."""
    pairs = tuple(model_pairs)
    if progress:
        progress("Đang cập nhật danh sách mô hình Argos...")
    argos_package.update_package_index()

    available = {
        (model.from_code, model.to_code): model
        for model in argos_package.get_available_packages()
    }
    installed = set(get_installed_model_pairs())

    for source_code, target_code in pairs:
        pair = (source_code, target_code)
        if pair in installed:
            if progress:
                progress(f"Đã có mô hình {source_code} → {target_code}")
            continue

        model = available.get(pair)
        if model is None:
            raise RuntimeError(
                f"Không tìm thấy mô hình {source_code} → {target_code}."
            )

        if progress:
            progress(f"Đang tải mô hình {source_code} → {target_code}...")
        argos_package.install_from_path(model.download())
        installed.add(pair)
        if progress:
            progress(f"Đã cài mô hình {source_code} → {target_code}")

    return sorted(installed)
