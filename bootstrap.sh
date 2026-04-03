#!/usr/bin/env bash
#
# Contribot One-Line Bootstrap
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/JiayuuWang/Contribot/main/bootstrap.sh | bash -s -- --api-key YOUR_KEY
#   curl -fsSL ... | bash -s -- --api-key YOUR_KEY --base-url https://your-proxy.com
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()  { echo -e "${CYAN}${BOLD}[contribot]${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  !${NC} $*"; }
err()   { echo -e "${RED}  ✗ $*${NC}"; }
fail()  { err "$@"; exit 1; }
ask()   { echo -e "${YELLOW}  ?${NC} $*"; }

# Read a line from the real terminal (works even when script is piped via curl|bash)
prompt_input() {
  echo -ne "${YELLOW}  ?${NC} $1 "
  read -r REPLY </dev/tty
  echo "$REPLY"
}

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="mac" ;;
  *)       PLATFORM="unknown" ;;
esac

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

echo ""
echo -e "${BOLD}  Contribot — Autonomous Open-Source Contributor${NC}"
echo -e "${DIM}  Setting up your environment...${NC}"
echo ""

# Helper: get latest gh CLI version from GitHub API
get_gh_latest_version() {
  local ver
  # </dev/null prevents curl from reading stdin (critical when script is piped)
  ver=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest </dev/null 2>/dev/null \
    | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
  if [[ -z "$ver" ]]; then
    fail "Could not determine latest gh CLI version. Check your internet connection."
  fi
  echo "$ver"
}

# ========== 1. Git ==========
if command -v git &>/dev/null; then
  ok "Git $(git --version | head -1)"
else
  info "Git not found. Installing..."
  if [[ "$PLATFORM" == "mac" ]]; then
    info "Installing Xcode Command Line Tools (includes Git)..."
    xcode-select --install 2>/dev/null </dev/null || true
    echo ""
    ask "Xcode tools installer may have opened a dialog."
    ask "Please complete the installation, then press Enter to continue."
    read -r </dev/tty
  elif [[ "$PLATFORM" == "linux" ]]; then
    if command -v apt-get &>/dev/null; then
      sudo apt-get update -qq </dev/null && sudo apt-get install -y -qq git </dev/null
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y git </dev/null
    elif command -v yum &>/dev/null; then
      sudo yum install -y git </dev/null
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm git </dev/null
    elif command -v apk &>/dev/null; then
      sudo apk add git </dev/null
    else
      fail "Could not detect package manager. Install Git manually: https://git-scm.com"
    fi
  else
    fail "Unsupported OS. Install Git manually: https://git-scm.com"
  fi

  command -v git &>/dev/null || fail "Git installation failed. Install manually: https://git-scm.com"
  ok "Git installed: $(git --version | head -1)"
fi

# Check git user config
GIT_USER=$(git config --global user.name 2>/dev/null || true)
GIT_EMAIL=$(git config --global user.email 2>/dev/null || true)
if [[ -z "$GIT_USER" || -z "$GIT_EMAIL" ]]; then
  echo ""
  warn "Git user identity not configured."
  ask "This is needed so your commits have the correct author info."
  echo ""
  if [[ -z "$GIT_USER" ]]; then
    GIT_USER=$(prompt_input "Enter your name for git commits:")
    git config --global user.name "$GIT_USER"
  fi
  if [[ -z "$GIT_EMAIL" ]]; then
    GIT_EMAIL=$(prompt_input "Enter your email for git commits:")
    git config --global user.email "$GIT_EMAIL"
  fi
  ok "Git identity set: $GIT_USER <$GIT_EMAIL>"
fi

# ========== 2. GitHub CLI ==========
if command -v gh &>/dev/null; then
  ok "GitHub CLI $(gh --version | head -1)"
else
  info "GitHub CLI not found. Installing..."
  if [[ "$PLATFORM" == "mac" ]]; then
    GH_VERSION=$(get_gh_latest_version)
    if [[ "$ARCH" == "arm64" ]]; then
      GH_ARCHIVE="gh_${GH_VERSION}_macOS_arm64.zip"
    else
      GH_ARCHIVE="gh_${GH_VERSION}_macOS_amd64.zip"
    fi
    info "Downloading gh v${GH_VERSION}..."
    curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_ARCHIVE}" -o /tmp/contribot_gh.zip </dev/null
    unzip -qo /tmp/contribot_gh.zip -d /tmp/contribot_gh_install </dev/null
    sudo mkdir -p /usr/local/bin
    sudo cp /tmp/contribot_gh_install/gh_*/bin/gh /usr/local/bin/gh
    sudo chmod +x /usr/local/bin/gh
    rm -rf /tmp/contribot_gh.zip /tmp/contribot_gh_install

  elif [[ "$PLATFORM" == "linux" ]]; then
    if command -v apt-get &>/dev/null; then
      (type -p wget >/dev/null || sudo apt-get install -y wget </dev/null) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg \
           | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
           | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt-get update -qq </dev/null \
        && sudo apt-get install -y -qq gh </dev/null
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y 'dnf-command(config-manager)' </dev/null \
        && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo </dev/null \
        && sudo dnf install -y gh </dev/null
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm github-cli </dev/null
    else
      GH_VERSION=$(get_gh_latest_version)
      case "$ARCH" in
        x86_64|amd64)   GH_ARCHIVE="gh_${GH_VERSION}_linux_amd64.tar.gz" ;;
        aarch64|arm64)  GH_ARCHIVE="gh_${GH_VERSION}_linux_arm64.tar.gz" ;;
        *)              fail "Unsupported architecture: $ARCH. Install gh manually: https://cli.github.com" ;;
      esac
      info "Downloading gh v${GH_VERSION}..."
      curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_ARCHIVE}" -o /tmp/contribot_gh.tar.gz </dev/null
      mkdir -p /tmp/contribot_gh_extract
      tar -xzf /tmp/contribot_gh.tar.gz -C /tmp/contribot_gh_extract </dev/null
      sudo mkdir -p /usr/local/bin
      sudo cp /tmp/contribot_gh_extract/gh_*/bin/gh /usr/local/bin/gh
      sudo chmod +x /usr/local/bin/gh
      rm -rf /tmp/contribot_gh.tar.gz /tmp/contribot_gh_extract
    fi
  fi

  command -v gh &>/dev/null || fail "GitHub CLI installation failed. Install manually: https://cli.github.com"
  ok "GitHub CLI installed: $(gh --version | head -1)"
fi

# GitHub CLI authentication
if gh auth status &>/dev/null 2>&1; then
  GH_USER=$(gh api user --jq '.login' </dev/null 2>/dev/null || echo "authenticated")
  ok "GitHub authenticated as: $GH_USER"
else
  echo ""
  warn "GitHub CLI is not authenticated."
  ask "You need to log in so Contribot can fork repos and create PRs under your account."
  ask "This will start an interactive login. Please follow the prompts."
  echo ""
  gh auth login </dev/tty
  echo ""
  if gh auth status &>/dev/null 2>&1; then
    ok "GitHub authentication successful"
  else
    fail "GitHub authentication failed. Run 'gh auth login' manually."
  fi
fi

# ========== 3. Node.js ==========
if command -v node &>/dev/null; then
  ok "Node.js $(node -v)"
else
  info "Node.js not found. Installing via fnm..."
  if ! command -v fnm &>/dev/null; then
    # --skip-shell: don't modify .bashrc/.zshrc during piped execution
    # </dev/null: prevent fnm installer from reading stdin pipe
    curl -fsSL https://fnm.vercel.app/install </dev/null | bash -s -- --skip-shell </dev/null
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
    eval "$(fnm env --shell bash 2>/dev/null || true)"
  fi
  fnm install --lts </dev/null
  fnm use --lts </dev/null
  command -v node &>/dev/null || fail "Node.js installation failed. Install manually: https://nodejs.org"
  ok "Node.js installed: $(node -v)"
fi

# ========== 4. pnpm ==========
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm -v)"
else
  info "Installing pnpm..."
  npm install -g pnpm </dev/null
  ok "pnpm installed: $(pnpm -v)"
fi

# ========== 5. Claude Code CLI ==========
if command -v claude &>/dev/null; then
  ok "Claude Code $(claude --version </dev/null 2>/dev/null | head -1)"
else
  info "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code </dev/null
  ok "Claude Code installed"
fi

# Set API key / base URL
if [[ -n "$API_KEY" ]]; then
  export ANTHROPIC_API_KEY="$API_KEY"
  ok "API key configured"
fi
if [[ -n "$BASE_URL" ]]; then
  export ANTHROPIC_BASE_URL="$BASE_URL"
  ok "API base URL: $BASE_URL"
fi

# ========== 6. Clone Contribot ==========
CONTRIBOT_DIR="Contribot"

if [[ -d "$CONTRIBOT_DIR/.git" ]]; then
  ok "Contribot repo found"
  cd "$CONTRIBOT_DIR"
  git pull --ff-only </dev/null 2>/dev/null || true
elif [[ -f "package.json" ]] && grep -q '"contribot"' package.json 2>/dev/null; then
  ok "Already in Contribot directory"
else
  info "Cloning Contribot..."
  git clone https://github.com/JiayuuWang/Contribot.git "$CONTRIBOT_DIR" </dev/null
  cd "$CONTRIBOT_DIR"
  ok "Cloned"
fi

# ========== 7. Install dependencies ==========
info "Installing dependencies..."
pnpm install --frozen-lockfile </dev/null 2>/dev/null || pnpm install </dev/null
ok "Dependencies installed"

# ========== 8. Generate config ==========
if [[ -f "contribot.toml" ]]; then
  warn "contribot.toml already exists, skipping generation"
else
  info "Generating config with this week's trending repos..."
  QUICKSTART_ARGS=""
  [[ -n "$API_KEY" ]] && QUICKSTART_ARGS="$QUICKSTART_ARGS --api-key $API_KEY"
  [[ -n "$BASE_URL" ]] && QUICKSTART_ARGS="$QUICKSTART_ARGS --base-url $BASE_URL"
  [[ -n "$MODEL" ]] && QUICKSTART_ARGS="$QUICKSTART_ARGS --model $MODEL"
  pnpm dev quickstart $QUICKSTART_ARGS </dev/null
fi

# ========== 9. Start ==========
echo ""
info "Setup complete. Starting Contribot..."
echo ""
pnpm dev run --once --dashboard </dev/null
