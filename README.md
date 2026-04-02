# Contribot

**[English](README.md)** | **[中文](README.zh-CN.md)** | **[한국어](README.ko.md)**

A system that automatically contributes to GitHub open-source repositories using tons of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as the reasoning engine. It spawns autonomous Claude Code instances that analyze repos, write code, and submit PRs under **your own GitHub account**.

## Quickstart — One Command

Everything — Node.js, pnpm, Claude Code, clone, dependencies, config — handled automatically. Just provide your API key:

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/JiayuuWang/Contribot/main/bootstrap.sh | bash -s -- --api-key sk-ant-xxx
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/JiayuuWang/Contribot/main/bootstrap.ps1 -OutFile bootstrap.ps1; .\bootstrap.ps1 -ApiKey "sk-ant-xxx"
```

**Using a custom API proxy:**
```bash
curl -fsSL https://raw.githubusercontent.com/JiayuuWang/Contribot/main/bootstrap.sh | bash -s -- \
  --api-key sk-ant-xxx \
  --base-url https://your-proxy.com
```

> The quickstart automatically targets **this week's top 10 GitHub trending repos**. Edit `contribot.toml` afterward to change targets.
>
> **Prerequisites that must be installed manually first:** [Git](https://git-scm.com) and [GitHub CLI](https://cli.github.com) (`gh auth login`). The bootstrap script installs everything else.

**Already cloned?** Run quickstart locally:
```bash
cd Contribot
pnpm dev quickstart --api-key sk-ant-xxx
pnpm dev run --once --dashboard
```

## How It Works

```
You configure target repos → Contribot spawns a Claude Code instance per repo →
Each instance: analyzes codebase + issues → writes code → commits → creates PR
```

For each target repo, Contribot launches an autonomous Claude Code instance with full tool access (Bash, Read, Edit, etc.). The instance handles the entire workflow: forking, cloning, analyzing, coding, committing, pushing, and PR creation — just like a human developer would in a terminal.

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js** >= 18 | Runtime | [nodejs.org](https://nodejs.org) |
| **pnpm** | Package manager | `npm install -g pnpm` |
| **Git** | Version control | [git-scm.com](https://git-scm.com) |
| **GitHub CLI** (`gh`) | Fork repos, create PRs | [cli.github.com](https://cli.github.com) |
| **Claude Code** (`claude`) | AI reasoning engine | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

> Works on **Windows**, **macOS**, and **Linux**. Setup and usage commands are identical on all platforms.

## Setup

```bash
# 1. Clone & install
git clone https://github.com/JiayuuWang/Contribot.git
cd Contribot
pnpm install

# 2. Authenticate GitHub CLI
gh auth login

# 3. Set up Claude Code (first run launches setup wizard)
claude
# Type /exit once you see the interactive interface

# 4. Initialize config
pnpm dev config init

# 5. Verify everything
pnpm dev config check
```

Edit `contribot.toml` to add your target repos:

```toml
[general]
scan_interval_minutes = 60
max_concurrent_repos = 3
claude_model = "sonnet"
dashboard_port = 3847

[github]
username = ""  # Auto-detected from gh auth if empty

[[repos]]
name = "owner/repo"
# focus = []           # Empty = all areas (bug-fixes, tests, docs, refactoring)
# reasons = ""         # Context for Claude
# issue_labels = []    # Empty = all issues
# max_prs_per_day = 2
# enabled = true
```

## Usage

```bash
# Single scan cycle
pnpm dev run --once

# Continuous mode (scans every N minutes)
pnpm dev run

# With web dashboard
pnpm dev run --dashboard

# Dry run (analyze only, no PRs)
pnpm dev run --dry-run

# Target a single repo
pnpm dev run --repo owner/repo
```

### Monitor

```bash
# CLI status
pnpm dev status

# Contribution history
pnpm dev history

# Web dashboard (standalone)
pnpm dev dashboard
```

Dashboard at `http://localhost:3847` — shows live Claude Code output in split-screen terminals, contribution history, and repo status. Supports dark/light theme toggle.

### Manage repos

```bash
pnpm dev repo add owner/repo --focus "bug-fixes,tests"
pnpm dev repo list
pnpm dev repo enable owner/repo
pnpm dev repo disable owner/repo
pnpm dev repo remove owner/repo
```

## Workspace Structure

Each target repo gets an isolated workspace:

```
data/workspaces/
└── owner__repo/
    ├── source/      # Git clone of the forked repo
    ├── logs/        # Per-session work logs (timestamped)
    └── notes.md     # Persistent analysis notes across sessions
```

Claude reads `notes.md` on startup to continue previous work rather than starting from scratch.

## Architecture

```
src/
├── cli/          # CLI commands (commander)
├── core/         # Orchestrator + repo prompt builder
├── claude/       # Claude Code bridge (stream-json subprocess)
├── db/           # SQLite persistence (drizzle-orm + better-sqlite3)
├── dashboard/    # Web UI (Fastify + htmx, dark/light theme)
└── utils/        # Logger, subprocess runner
```

Each repo is processed by a single Claude Code instance (`claude --print --dangerously-skip-permissions --output-format stream-json`) that receives a comprehensive prompt and handles the entire contribution workflow autonomously.

## Repo Config Reference

| Field | Required | Default | Effect |
|-------|----------|---------|--------|
| `name` | **Yes** | — | GitHub repo in `owner/repo` format |
| `focus` | No | `[]` (all areas) | Contribution scope: `bug-fixes`, `tests`, `documentation`, `refactoring`, `features`, `issues` |
| `reasons` | No | `""` | Context for Claude about why you want to contribute |
| `issue_labels` | No | `[]` (all issues) | GitHub labels to filter issues |
| `max_prs_per_day` | No | `2` | Daily PR cap per repo |
| `enabled` | No | `true` | Set `false` to skip |

## Safety Controls

- `--dry-run` mode: analyze without creating PRs
- Per-repo daily PR limit (default: 2)
- Claude budget cap per task
- AI-assisted disclosure in PR descriptions
- Isolated workspace per repo
- Graceful shutdown (SIGINT/SIGTERM)

## Troubleshooting

### API proxy TLS issues

If you use an API proxy that has TLS 1.3 renegotiation issues (connections hang), set:

```bash
NODE_OPTIONS="--tls-max-v1.2" pnpm dev run --once
```

This restricts TLS to version 1.2. Not needed for direct Anthropic API access.

### `better-sqlite3` build fails

This native module compiles during `pnpm install`. If it fails:

```bash
# Ensure build tools are installed
# macOS: xcode-select --install
# Ubuntu/Debian: sudo apt install build-essential python3
# Windows: npm install -g windows-build-tools
pnpm install
```

## Tech Stack

TypeScript, Node.js, SQLite (better-sqlite3 + drizzle-orm), Commander, Fastify, htmx, pino, node-cron, p-queue

## License

MIT
