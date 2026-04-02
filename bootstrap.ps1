#Requires -Version 5.1
<#
.SYNOPSIS
  Contribot One-Line Bootstrap for Windows

.DESCRIPTION
  Downloads and sets up everything needed to run Contribot.

.EXAMPLE
  irm https://raw.githubusercontent.com/JiayuuWang/Contribot/main/bootstrap.ps1 | iex
  # Then run: .\Start-Contribot.ps1 -ApiKey "YOUR_KEY"

.PARAMETER ApiKey
  Anthropic API key

.PARAMETER BaseUrl
  Custom API base URL (for proxies)

.PARAMETER Model
  Claude model (default: sonnet)
#>
param(
  [string]$ApiKey = "",
  [string]$BaseUrl = "",
  [string]$Model = "sonnet"
)

$ErrorActionPreference = "Stop"

function Info($msg)  { Write-Host "[contribot] $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

# ---------- 1. Node.js ----------
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeVer = node -v
  Ok "Node.js already installed: $nodeVer"
} else {
  Info "Installing Node.js via fnm..."
  if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    winget install Schniz.fnm --accept-source-agreements --accept-package-agreements 2>$null
    if ($LASTEXITCODE -ne 0) {
      Fail "Failed to install fnm. Install Node.js manually from https://nodejs.org"
    }
    $env:PATH = "$env:APPDATA\fnm;$env:PATH"
  }
  fnm install --lts
  fnm use --lts
  Ok "Node.js installed: $(node -v)"
}

# ---------- 2. pnpm ----------
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Ok "pnpm already installed: $(pnpm -v)"
} else {
  Info "Installing pnpm..."
  npm install -g pnpm
  Ok "pnpm installed: $(pnpm -v)"
}

# ---------- 3. Git ----------
if (Get-Command git -ErrorAction SilentlyContinue) {
  Ok "Git already installed"
} else {
  Fail "Git is required but not found. Install from https://git-scm.com"
}

# ---------- 4. GitHub CLI ----------
if (Get-Command gh -ErrorAction SilentlyContinue) {
  Ok "GitHub CLI already installed"
} else {
  Fail "GitHub CLI (gh) is required. Install from https://cli.github.com"
}

$ghAuth = gh auth status 2>&1
if ($LASTEXITCODE -eq 0) {
  Ok "GitHub CLI authenticated"
} else {
  Warn "GitHub CLI not authenticated. Running 'gh auth login'..."
  gh auth login
}

# ---------- 5. Claude Code CLI ----------
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Ok "Claude Code already installed"
} else {
  Info "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
  Ok "Claude Code installed"
}

# Set API key
if ($ApiKey) {
  $env:ANTHROPIC_API_KEY = $ApiKey
  Ok "API key set"
}
if ($BaseUrl) {
  $env:ANTHROPIC_BASE_URL = $BaseUrl
  Ok "Base URL set: $BaseUrl"
}

# ---------- 6. Clone Contribot ----------
$contribotDir = "Contribot"

if (Test-Path "$contribotDir\.git") {
  Ok "Contribot already cloned"
  Set-Location $contribotDir
  git pull --ff-only 2>$null
} elseif ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern '"contribot"' -Quiet)) {
  Ok "Already inside Contribot directory"
} else {
  Info "Cloning Contribot..."
  git clone https://github.com/JiayuuWang/Contribot.git $contribotDir
  Set-Location $contribotDir
  Ok "Cloned"
}

# ---------- 7. Install dependencies ----------
Info "Installing dependencies..."
pnpm install
Ok "Dependencies installed"

# ---------- 8. Generate config ----------
if (Test-Path "contribot.toml") {
  Warn "contribot.toml already exists, skipping generation"
} else {
  Info "Generating config with this week's trending repos..."
  $qsArgs = @()
  if ($ApiKey) { $qsArgs += "--api-key"; $qsArgs += $ApiKey }
  if ($BaseUrl) { $qsArgs += "--base-url"; $qsArgs += $BaseUrl }
  if ($Model) { $qsArgs += "--model"; $qsArgs += $Model }
  pnpm dev quickstart @qsArgs
}

# ---------- 9. Start ----------
Write-Host ""
Info "Starting Contribot..."
Write-Host ""
pnpm dev run --once --dashboard
