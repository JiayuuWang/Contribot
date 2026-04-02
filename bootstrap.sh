#!/usr/bin/env bash
#
# Contribot One-Line Bootstrap
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/JiayuuWang/Contribot/main/bootstrap.sh | bash -s -- --api-key YOUR_KEY
#   curl -fsSL ... | bash -s -- --api-key YOUR_KEY --base-url https://your-proxy.com
#
# What it does:
#   1. Installs Node.js (if missing) via fnm
#   2. Installs pnpm (if missing)
#   3. Installs Claude Code CLI (if missing)
#   4. Clones Contribot (if not already cloned)
#   5. Installs dependencies
#   6. Generates contribot.toml with this week's GitHub trending repos
#   7. Starts contributing
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[contribot]${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()  { echo -e "${RED}  ✗${NC} $*"; exit 1; }

# ---------- Parse args ----------
API_KEY=""
BASE_URL=""
MODEL="sonnet"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key)   API_KEY="$2"; shift 2 ;;
    --base-url)  BASE_URL="$2"; shift 2 ;;
    --model)     MODEL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ---------- 1. Node.js ----------
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  ok "Node.js already installed: $NODE_VER"
else
  info "Installing Node.js via fnm..."
  if command -v fnm &>/dev/null; then
    ok "fnm already installed"
  else
    curl -fsSL https://fnm.vercel.app/install | bash
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
    eval "$(fnm env --shell bash 2>/dev/null || true)"
  fi
  fnm install --lts
  fnm use --lts
  ok "Node.js installed: $(node -v)"
fi

# ---------- 2. pnpm ----------
if command -v pnpm &>/dev/null; then
  ok "pnpm already installed: $(pnpm -v)"
else
  info "Installing pnpm..."
  npm install -g pnpm
  ok "pnpm installed: $(pnpm -v)"
fi

# ---------- 3. Git ----------
if command -v git &>/dev/null; then
  ok "Git already installed"
else
  fail "Git is required but not found. Install it from https://git-scm.com"
fi

# ---------- 4. GitHub CLI ----------
if command -v gh &>/dev/null; then
  ok "GitHub CLI already installed"
else
  fail "GitHub CLI (gh) is required but not found. Install it from https://cli.github.com"
fi

# Check gh auth
if gh auth status &>/dev/null; then
  ok "GitHub CLI authenticated"
else
  warn "GitHub CLI not authenticated. Running 'gh auth login'..."
  gh auth login
fi

# ---------- 5. Claude Code CLI ----------
if command -v claude &>/dev/null; then
  ok "Claude Code already installed: $(claude --version 2>/dev/null | head -1)"
else
  info "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude Code installed"
fi

# Set API key if provided
if [[ -n "$API_KEY" ]]; then
  export ANTHROPIC_API_KEY="$API_KEY"
  ok "API key set"
fi
if [[ -n "$BASE_URL" ]]; then
  export ANTHROPIC_BASE_URL="$BASE_URL"
  ok "Base URL set: $BASE_URL"
fi

# ---------- 6. Clone Contribot ----------
CONTRIBOT_DIR="Contribot"

if [[ -d "$CONTRIBOT_DIR/.git" ]]; then
  ok "Contribot already cloned"
  cd "$CONTRIBOT_DIR"
  git pull --ff-only 2>/dev/null || true
elif [[ -f "package.json" ]] && grep -q '"contribot"' package.json 2>/dev/null; then
  ok "Already inside Contribot directory"
else
  info "Cloning Contribot..."
  git clone https://github.com/JiayuuWang/Contribot.git "$CONTRIBOT_DIR"
  cd "$CONTRIBOT_DIR"
  ok "Cloned"
fi

# ---------- 7. Install dependencies ----------
info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ---------- 8. Generate config with trending repos ----------
if [[ -f "contribot.toml" ]]; then
  warn "contribot.toml already exists, skipping generation"
else
  info "Generating config with this week's trending repos..."
  QUICKSTART_ARGS=""
  [[ -n "$API_KEY" ]] && QUICKSTART_ARGS="$QUICKSTART_ARGS --api-key $API_KEY"
  [[ -n "$BASE_URL" ]] && QUICKSTART_ARGS="$QUICKSTART_ARGS --base-url $BASE_URL"
  [[ -n "$MODEL" ]] && QUICKSTART_ARGS="$QUICKSTART_ARGS --model $MODEL"
  pnpm dev quickstart $QUICKSTART_ARGS
fi

# ---------- 9. Start ----------
echo ""
info "Starting Contribot..."
echo ""
pnpm dev run --once --dashboard
