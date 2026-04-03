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
fail()  { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
ask()   { echo -e "${YELLOW}  ?${NC} $*"; }

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

# ========== 1. Git ==========
if command -v git &>/dev/null; then
  ok "Git $(git --version | head -1)"
else
  info "Git not found. Installing..."
  if [[ "$PLATFORM" == "mac" ]]; then
    # macOS: xcode-select includes git, no Homebrew needed
    info "Installing Xcode Command Line Tools (includes Git)..."
    xcode-select --install 2>/dev/null || true
    echo ""
    ask "Xcode tools installer may have opened a dialog." </dev/tty
    ask "Please complete the installation, then press Enter to continue." </dev/tty
    read -r </dev/tty
  elif [[ "$PLATFORM" == "linux" ]]; then
    if command -v apt-get &>/dev/null; then
      sudo apt-get update -qq && sudo apt-get install -y -qq git
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y git
    elif command -v yum &>/dev/null; then
      sudo yum install -y git
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm git
    elif command -v apk &>/dev/null; then
      sudo apk add git
    else
      fail "Could not detect package manager. Install Git manually: https://git-scm.com"
    fi
  else
    fail "Unsupported OS. Install Git manually: https://git-scm.com"
  fi

  if command -v git &>/dev/null; then
    ok "Git installed: $(git --version | head -1)"
  else
    fail "Git installation failed. Install manually: https://git-scm.com"
  fi
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
    echo -ne "${YELLOW}  ?${NC} Enter your name for git commits: "
    read -r GIT_USER </dev/tty
    git config --global user.name "$GIT_USER"
  fi
  if [[ -z "$GIT_EMAIL" ]]; then
    echo -ne "${YELLOW}  ?${NC} Enter your email for git commits: "
    read -r GIT_EMAIL </dev/tty
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
    # Download gh binary directly (no Homebrew)
    GH_VERSION=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep '"tag_name"' | head -1 | sed 's/.*"v\(.*\)".*/\1/')
    if [[ "$ARCH" == "arm64" ]]; then
      GH_ARCHIVE="gh_${GH_VERSION}_macOS_arm64.zip"
    else
      GH_ARCHIVE="gh_${GH_VERSION}_macOS_amd64.zip"
    fi
    info "Downloading gh v${GH_VERSION}..."
    curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_ARCHIVE}" -o /tmp/gh.zip
    unzip -qo /tmp/gh.zip -d /tmp/gh_install
    sudo cp /tmp/gh_install/*/bin/gh /usr/local/bin/gh
    sudo chmod +x /usr/local/bin/gh
    rm -rf /tmp/gh.zip /tmp/gh_install
  elif [[ "$PLATFORM" == "linux" ]]; then
    if command -v apt-get &>/dev/null; then
      (type -p wget >/dev/null || sudo apt-get install -y wget) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt-get update -qq \
        && sudo apt-get install -y -qq gh
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y 'dnf-command(config-manager)' && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo dnf install -y gh
    elif command -v yum &>/dev/null; then
      sudo yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo yum install -y gh
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm github-cli
    else
      # Direct binary download as fallback
      GH_VERSION=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep '"tag_name"' | head -1 | sed 's/.*"v\(.*\)".*/\1/')
      if [[ "$ARCH" == "x86_64" || "$ARCH" == "amd64" ]]; then
        GH_ARCHIVE="gh_${GH_VERSION}_linux_amd64.tar.gz"
      elif [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        GH_ARCHIVE="gh_${GH_VERSION}_linux_arm64.tar.gz"
      else
        fail "Unsupported architecture: $ARCH. Install gh manually: https://cli.github.com"
      fi
      info "Downloading gh v${GH_VERSION}..."
      curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_ARCHIVE}" -o /tmp/gh.tar.gz
      tar -xzf /tmp/gh.tar.gz -C /tmp
      sudo cp /tmp/gh_*/bin/gh /usr/local/bin/gh
      sudo chmod +x /usr/local/bin/gh
      rm -rf /tmp/gh.tar.gz /tmp/gh_*
    fi
  fi

  if command -v gh &>/dev/null; then
    ok "GitHub CLI installed: $(gh --version | head -1)"
  else
    fail "GitHub CLI installation failed. Install manually: https://cli.github.com"
  fi
fi

# GitHub CLI authentication
# Use /dev/tty for interactive input since stdin may be a pipe (curl | bash)
if gh auth status &>/dev/null 2>&1; then
  GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
  ok "GitHub authenticated as: $GH_USER"
else
  echo ""
  warn "GitHub CLI is not authenticated."
  ask "You need to log in so Contribot can fork repos and create PRs under your account."
  ask "This will start an interactive login. Please follow the prompts."
  echo ""
  # Redirect stdin from /dev/tty so gh auth login can interact with the user
  # even when this script is run via curl | bash
  gh auth login </dev/tty
  echo ""
  if gh auth status &>/dev/null 2>&1; then
    ok "GitHub authentication successful"
  else
    fail "GitHub authentication failed. Run 'gh auth login' manually after the script finishes."
  fi
fi

# ========== 3. Node.js ==========
if command -v node &>/dev/null; then
  ok "Node.js $(node -v)"
else
  info "Node.js not found. Installing via fnm..."
  if ! command -v fnm &>/dev/null; then
    curl -fsSL https://fnm.vercel.app/install | bash
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
    eval "$(fnm env --shell bash 2>/dev/null || true)"
  fi
  fnm install --lts
  fnm use --lts
  ok "Node.js installed: $(node -v)"
fi

# ========== 4. pnpm ==========
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm -v)"
else
  info "Installing pnpm..."
  npm install -g pnpm
  ok "pnpm installed: $(pnpm -v)"
fi

# ========== 5. Claude Code CLI ==========
if command -v claude &>/dev/null; then
  ok "Claude Code $(claude --version 2>/dev/null | head -1)"
else
  info "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
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
  git pull --ff-only 2>/dev/null || true
elif [[ -f "package.json" ]] && grep -q '"contribot"' package.json 2>/dev/null; then
  ok "Already in Contribot directory"
else
  info "Cloning Contribot..."
  git clone https://github.com/JiayuuWang/Contribot.git "$CONTRIBOT_DIR"
  cd "$CONTRIBOT_DIR"
  ok "Cloned"
fi

# ========== 7. Install dependencies ==========
info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
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
  pnpm dev quickstart $QUICKSTART_ARGS
fi

# ========== 9. Start ==========
echo ""
info "Setup complete. Starting Contribot..."
echo ""
pnpm dev run --once --dashboard
