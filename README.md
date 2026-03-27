# Contribot

A CLI tool that automatically contributes to GitHub open-source repositories using [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as the reasoning engine. It continuously monitors your target repos, analyzes issues and codebase, then submits PRs under **your own GitHub account**.

## How It Works

```
You configure target repos → Contribot scans issues & code →
Claude Code analyzes & writes fixes → Git commits under your account →
PR submitted to upstream
```

**Core loop:**

1. **Scan** — Fetch open issues, analyze codebase for improvement opportunities
2. **Plan** — Rank candidates by feasibility, check daily PR limits
3. **Contribute** — Claude Code makes code changes in an isolated workspace
4. **Submit** — Commit, push, and create PR via `gh` CLI

All git operations use native `git` commands. PRs are created under your GitHub identity, not Claude's.

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js** >= 18 | Runtime | [nodejs.org](https://nodejs.org) |
| **pnpm** | Package manager | `npm install -g pnpm` |
| **Git** | Version control | [git-scm.com](https://git-scm.com) |
| **GitHub CLI** (`gh`) | Fork repos, create PRs | [cli.github.com](https://cli.github.com) |
| **Claude Code** (`claude`) | AI reasoning engine | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/JiayuuWang/Contribot.git
cd Contribot
pnpm install
```

### 2. Authenticate tools

```bash
# GitHub CLI
gh auth login

# Claude Code (follow its setup wizard)
claude
```

### 3. Initialize config

```bash
pnpm dev config init
```

This creates `contribot.toml`. Edit it to add your target repositories:

```toml
[general]
scan_interval_minutes = 60    # How often to scan
max_concurrent_repos = 3      # Parallel repo processing
claude_model = "sonnet"       # Claude model to use
max_budget_per_task_usd = 0.50
dashboard_port = 3847

[github]
username = ""  # Auto-detected from `gh auth status`

[[repos]]
name = "owner/repo"
focus = ["bug-fixes", "tests"]
reasons = "Interested in contributing to this project"
issue_labels = ["good first issue", "help wanted"]
max_prs_per_day = 2
enabled = true
```

### 4. Verify setup

```bash
pnpm dev config check
```

Expected output:

```
  ✓ git: git version 2.x.x
  ✓ gh CLI: gh version 2.x.x
  ✓ gh auth: Logged in as yourname
  ✓ claude CLI: x.x.x (Claude Code)
  ✓ contribot.toml: valid
```

## Usage

### Manage target repos

```bash
# Add a repo
pnpm dev repo add owner/repo --focus "bug-fixes,tests" --reasons "Want to contribute"

# List repos
pnpm dev repo list

# Enable/disable
pnpm dev repo enable owner/repo
pnpm dev repo disable owner/repo

# Remove
pnpm dev repo remove owner/repo
```

### Run the orchestrator

```bash
# Start continuous mode (scans every N minutes)
pnpm dev run

# Single scan cycle then exit
pnpm dev run --once

# Dry run (scan & plan, no PRs)
pnpm dev run --dry-run

# Process one specific repo
pnpm dev run --repo owner/repo

# Start with web dashboard
pnpm dev run --dashboard
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

The dashboard runs at `http://localhost:3847` and auto-refreshes every 10 seconds.

## Architecture

```
src/
├── cli/          # CLI commands (commander)
├── core/         # Orchestrator, Scanner, Planner, Contributor
├── claude/       # Claude Code bridge (subprocess invocation)
├── git/          # Native git operations (clone, branch, commit, push)
├── github/       # GitHub CLI wrappers (issues, PRs)
├── db/           # SQLite persistence (drizzle-orm)
├── dashboard/    # Web UI (Fastify + htmx + pico.css)
└── utils/        # Logger, subprocess runner
```

**Key design decisions:**

- **SQLite** for persistence — single file, no external process, survives restarts
- **p-queue** for concurrency — process N repos in parallel
- **Claude `--print` mode** — non-interactive subprocess, structured output
- **Native `git` + `gh` CLI** — uses your credentials, your identity
- **htmx dashboard** — no build step, ~30KB client-side

## Safety Controls

- `--dry-run` mode: scan and plan without creating PRs
- Per-repo daily PR limit (default: 2)
- Claude budget cap per task (`max_budget_per_task_usd`)
- AI-assisted disclosure in PR descriptions
- Isolated workspace per repo
- Graceful shutdown (SIGINT/SIGTERM)

## Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `scan_interval_minutes` | 60 | Minutes between scan cycles |
| `max_concurrent_repos` | 3 | Max repos processed in parallel |
| `claude_model` | sonnet | Claude model for analysis |
| `max_budget_per_task_usd` | 0.50 | Cost cap per Claude invocation |
| `dashboard_port` | 3847 | Dashboard HTTP port |
| `max_prs_per_day` | 2 | Per-repo daily PR limit |

## Tech Stack

TypeScript, Node.js, SQLite (better-sqlite3 + drizzle-orm), Commander, Fastify, htmx, pico.css, pino, node-cron, p-queue

## License

MIT
