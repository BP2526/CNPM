$ErrorActionPreference = "Stop"
$healthUrl = "http://127.0.0.1:8000/api/health"
try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    if ($health.status -ne "ok") { throw "Unexpected health response." }
} catch {
    Write-Error "CNPM is not responding at $healthUrl. Start it first with .\run_local.ps1 in another PowerShell window."
    exit 1
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflared) {
    $cloudflaredPath = $cloudflared.Source
} else {
    $cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
}
if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
    Write-Error "cloudflared was not found. Install it with: winget install --id Cloudflare.cloudflared --exact"
    exit 1
}

Write-Host "Starting temporary HTTPS tunnel to CNPM on port 8000."
Write-Host "Share the https://....trycloudflare.com URL printed below. Press Ctrl+C to stop the tunnel."
& $cloudflaredPath tunnel --url http://localhost:8000 --no-autoupdate
