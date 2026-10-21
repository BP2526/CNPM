$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$translator = Join-Path $root "DocxTranslator"
$venvPython = Join-Path $translator ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) { throw "Chưa cài môi trường. Chạy .\setup_windows.ps1 trước." }
Set-Location $translator
& $venvPython -m uvicorn api:app --host 0.0.0.0 --port 8000
