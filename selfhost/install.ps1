# ======================================================================
# ENCA self-hosted — one-command local setup for Windows (R06).
#
#   irm https://raw.githubusercontent.com/nurejev/enca/beta/selfhost/install.ps1 | iex
#   # or, from a clone:  .\selfhost\install.ps1 [-Port 8080] [-Tag latest]
#
# BETA-CHANNEL COPY: branch and default tag are `beta` here. The beta→main
# port rewrites both to main / latest — see promote.js item 92.
#
# What it does — nothing more than the four steps it prints:
#   1. checks Docker Desktop is installed and running
#   2. pulls ghcr.io/nurejev/enca:beta (-Tag latest for production)
#   3. runs it on http://localhost:PORT (default 8080), picking up an
#      optional .\selfhost-branding.json next to where you run it
#   4. tells you about the ONE step it cannot do for you: the redirect URI
# ======================================================================
param(
  [int]$Port = 8080,
  [string]$Tag = "beta",
  # Your own registration, from New-EncaAppRegistration.ps1. Optional: without
  # them the container uses the shared multi-tenant registration.
  [string]$ClientId,
  # Only for a SINGLE-TENANT registration (-SingleTenant). Omit otherwise.
  [string]$TenantId
)
$ErrorActionPreference = "Stop"
$Image = "ghcr.io/nurejev/enca:$Tag"
$Name  = "enca"

function Say($m)  { Write-Host "==> $m" -ForegroundColor Green }
function Fail($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

# 1 — Docker present and running
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker is not installed. Get Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this script again."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker is installed but not running. Start Docker Desktop and run this script again." }

# 2 — the image
Say "Pulling $Image ..."
docker pull $Image
if ($LASTEXITCODE -ne 0) { Fail "Could not pull $Image. Is the package public, and are you online?" }

# 3 — (re)start the container
$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $Name }
if ($existing) {
  Say "Replacing the existing '$Name' container."
  docker rm -f $Name *> $null
}
$brandingArgs = @()
$brandingFile = Join-Path (Get-Location) "selfhost-branding.json"
if (Test-Path $brandingFile) {
  Say "Found .\selfhost-branding.json - this deployment will wear your branding."
  $brandingArgs = @("-v", "${brandingFile}:/usr/share/nginx/html/selfhost-branding.json:ro")
}
# Your own app registration: .\selfhost\install.ps1 -ClientId <guid> [-TenantId <guid>]
# Omitted values are not passed at all, so the image keeps its defaults.
$authArgs = @()
if ($ClientId) { $authArgs += @("-e", "ENCA_CLIENT_ID=$ClientId") }
if ($TenantId) { $authArgs += @("-e", "ENCA_TENANT_ID=$TenantId") }
if ($authArgs.Count) { Say "Using your own app registration ($ClientId)." }
docker run -d --name $Name --restart unless-stopped -p "${Port}:80" @brandingArgs @authArgs $Image *> $null
if ($LASTEXITCODE -ne 0) { Fail "docker run failed - is port $Port free?" }

$Url = "http://localhost:$Port"
Say "ENCA is running at $Url"

# 4 — the step that cannot be automated
Write-Host ""
Write-Host "  ONE THING LEFT TO DO, and sign-in fails without it (error AADSTS50011):" -ForegroundColor Yellow
Write-Host "  $Url must be a SPA redirect URI on the Entra app registration you use."
Write-Host ""
Write-Host "    - Your own registration (recommended): run New-EncaAppRegistration.ps1"
Write-Host "      from the repo - it creates the registration AND adds this URI."
Write-Host "    - An existing registration: Entra admin center -> App registrations ->"
Write-Host "      your app -> Authentication -> Single-page application -> add $Url"
Write-Host ""
Write-Host "  Details: https://github.com/nurejev/enca/blob/beta/SELF-HOSTING.md"
Write-Host ""

Start-Process $Url
