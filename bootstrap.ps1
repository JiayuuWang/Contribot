#Requires -Version 5.1
<#
.SYNOPSIS
  Contribot One-Line Bootstrap for Windows.
.EXAMPLE
  .\bootstrap.ps1 -ApiKey "sk-ant-xxx"
  .\bootstrap.ps1 -ApiKey "sk-ant-xxx" -BaseUrl "https://your-proxy.com"
#>
param(
  [string]$ApiKey = "",
  [string]$BaseUrl = "",
  [string]$Model = "sonnet"
)

$ErrorActionPreference = "Stop"

function Info($msg)  { Write-Host "[contribot] $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  $([char]0x2713) $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "  x $msg" -ForegroundColor Red; exit 1 }
function Ask($msg)   { Write-Host "  ? $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  Contribot - Autonomous Open-Source Contributor" -ForegroundColor White
Write-Host "  Setting up your environment..." -ForegroundColor DarkGray
Write-Host ""

# ========== 1. Git ==========
if (Get-Command git -ErrorAction SilentlyContinue) {
  Ok "Git $(git --version)"
} else {
  Info "Git not found. Installing via winget..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if (Get-Command git -ErrorAction SilentlyContinue) {
      Ok "Git installed: $(git --version)"
    } else {
      Warn "Git installed but not in PATH. You may need to restart your terminal."
      Warn "After restarting, run this script again."
      exit 1
    }
  } else {
    Fail "winget not available. Install Git manually from https://git-scm.com"
  }
}

# Check git user config
$gitUser = git config --global user.name 2>$null
$gitEmail = git config --global user.email 2>$null
if (-not $gitUser -or -not $gitEmail) {
  Write-Host ""
  Warn "Git user identity not configured."
  Ask "This is needed so your commits have the correct author info."
  Write-Host ""
  if (-not $gitUser) {
    $gitUser = Read-Host "  ? Enter your name for git commits"
    git config --global user.name "$gitUser"
  }
  if (-not $gitEmail) {
    $gitEmail = Read-Host "  ? Enter your email for git commits"
    git config --global user.email "$gitEmail"
  }
  Ok "Git identity set: $gitUser <$gitEmail>"
}

# ========== 2. GitHub CLI ==========
if (Get-Command gh -ErrorAction SilentlyContinue) {
  Ok "GitHub CLI $(gh --version | Select-Object -First 1)"
} else {
  Info "GitHub CLI not found. Installing via winget..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install GitHub.cli --accept-source-agreements --accept-package-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if (Get-Command gh -ErrorAction SilentlyContinue) {
      Ok "GitHub CLI installed"
    } else {
      Warn "GitHub CLI installed but not in PATH. Restart your terminal and re-run."
      exit 1
    }
  } else {
    Fail "winget not available. Install GitHub CLI manually from https://cli.github.com"
  }
}

# GitHub CLI auth
$ghAuth = gh auth status 2>&1
if ($LASTEXITCODE -eq 0) {
  $ghUser = gh api user --jq '.login' 2>$null
  Ok "GitHub authenticated as: $ghUser"
} else {
  Write-Host ""
  Warn "GitHub CLI is not authenticated."
  Ask "You need to log in so Contribot can fork repos and create PRs under your account."
  Ask "This will open an interactive login flow."
  Write-Host ""
  gh auth login
  Write-Host ""
  $ghAuth2 = gh auth status 2>&1
  if ($LASTEXITCODE -eq 0) {
    Ok "GitHub authentication successful"
  } else {
    Fail "GitHub authentication failed. Run 'gh auth login' manually."
  }
}

# ========== 3. Node.js ==========
if (Get-Command node -ErrorAction SilentlyContinue) {
  Ok "Node.js $(node -v)"
} else {
  Info "Node.js not found. Installing via fnm..."
  if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      winget install Schniz.fnm --accept-source-agreements --accept-package-agreements
    } else {
      Fail "winget not available. Install Node.js manually from https://nodejs.org"
    }
    $env:PATH = "$env:APPDATA\fnm;$env:PATH"
    # Setup fnm env for current session
    fnm env --use-on-cd | Out-String | Invoke-Expression 2>$null
  }
  fnm install --lts
  fnm use --lts
  Ok "Node.js installed: $(node -v)"
}

# ========== 4. pnpm ==========
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Ok "pnpm $(pnpm -v)"
} else {
  Info "Installing pnpm..."
  npm install -g pnpm
  Ok "pnpm installed: $(pnpm -v)"
}

# ========== 5. Claude Code CLI ==========
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Ok "Claude Code $(claude --version 2>$null | Select-Object -First 1)"
} else {
  Info "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
  Ok "Claude Code installed"
}

# Set API key / base URL
if ($ApiKey) {
  $env:ANTHROPIC_API_KEY = $ApiKey
  Ok "API key configured"
}
if ($BaseUrl) {
  $env:ANTHROPIC_BASE_URL = $BaseUrl
  Ok "API base URL: $BaseUrl"
}

# ========== 6. Clone Contribot ==========
$contribotDir = "Contribot"

if (Test-Path "$contribotDir\.git") {
  Ok "Contribot repo found"
  Set-Location $contribotDir
  git pull --ff-only 2>$null
} elseif ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern '"contribot"' -Quiet)) {
  Ok "Already in Contribot directory"
} else {
  Info "Cloning Contribot..."
  git clone https://github.com/JiayuuWang/Contribot.git $contribotDir
  Set-Location $contribotDir
  Ok "Cloned"
}

# ========== 7. Install dependencies ==========
Info "Installing dependencies..."
pnpm install
Ok "Dependencies installed"

# ========== 8. Generate config ==========
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

# ========== 9. Start ==========
Write-Host ""
Info "Setup complete. Starting Contribot..."
Write-Host ""
pnpm dev run --once --dashboard
