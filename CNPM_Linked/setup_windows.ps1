$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$translator = Join-Path $root "DocxTranslator"
$venvPython = Join-Path $translator ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) { py -m venv (Join-Path $translator ".venv") }
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $translator "requirements.txt")
& $venvPython (Join-Path $translator "install_argos_models.py")
Write-Host "Cài đặt hoàn tất. Chạy .\run_local.ps1 để mở ứng dụng."
