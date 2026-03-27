# Contribot

**[English](README.md)** | **[中文](README.zh-CN.md)** | **[한국어](README.ko.md)**

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

### Step 1: Clone & Install

```bash
git clone https://github.com/JiayuuWang/Contribot.git
cd Contribot
pnpm install
```

### Step 2: Ensure prerequisites are ready

Contribot depends on three external tools. Install and authenticate them beforehand. **They are prerequisites only — they do not need to run in the background.** Contribot invokes them automatically as subprocesses at runtime.

#### 2a. GitHub CLI — for forking repos and creating PRs

```bash
# After installing, log in to your GitHub account (interactive)
gh auth login
```

Verify: `gh auth status` should show your username.

#### 2b. Claude Code — AI reasoning engine

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# First run launches the setup wizard for API key or OAuth
claude
```

Seeing the interactive interface means setup is complete. Type `/exit` to quit. **You do not need to keep Claude Code running** — Contribot calls it via `claude --print` in the background.

#### 2c. Git — verify user config

```bash
git config --global user.name   # should show your name
git config --global user.email  # should show your email
```

### Step 3: Initialize Contribot config

```bash
pnpm dev config init
```

This creates `contribot.toml` in the project root. Open it and add your target repositories:

```toml
[general]
scan_interval_minutes = 60       # How often to scan (minutes)
max_concurrent_repos = 3         # Parallel repo processing
claude_model = "sonnet"          # Claude model (sonnet/opus/haiku)
max_budget_per_task_usd = 0.50   # Cost cap per Claude invocation
dashboard_port = 3847

[github]
username = ""  # Auto-detected from gh auth if left empty

# Only "name" is required. All other fields have defaults.
[[repos]]
name = "owner/repo"
```

#### Repo fields reference

| Field | Required | Default | Effect |
|-------|----------|---------|--------|
| `name` | **Yes** | — | GitHub repo in `owner/repo` format |
| `focus` | No | `["bug-fixes"]` | What to contribute. Controls what Claude looks for during scans. Values: `bug-fixes`, `tests`, `documentation`, `refactoring`, `features`, `issues` |
| `reasons` | No | `""` | Context passed to Claude explaining why you want to contribute. Helps it make better decisions |
| `issue_labels` | No | `["good first issue"]` | GitHub labels to filter issues. Only issues with these labels are scanned |
| `max_prs_per_day` | No | `2` | Daily PR cap for this repo. Set to `0` to pause PRs while still scanning |
| `enabled` | No | `true` | Set to `false` to skip this repo during scan cycles |

> **Note on `focus`:** Only adding `"issues"` to the focus list enables Contribot to *create new issues*. Without it, Contribot only creates PRs. Adding `"tests"`, `"documentation"`, or `"refactoring"` enables proactive codebase scanning beyond issue-based contributions.

### Step 4: Verify everything

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

All checks passed! Ready to run.
```

If any check fails, install or authenticate the corresponding tool.

## Usage

### Manage target repos

Two ways to add target repos — **pick either one**, no need to do both:

**Option A: Edit `contribot.toml` directly** (recommended for bulk configuration)

Add `[[repos]]` blocks to the config file. Contribot syncs them to the database on startup.

**Option B: Use CLI commands** (recommended for quickly adding a single repo)

```bash
# Add a repo (writes to both contribot.toml and database)
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

The dashboard runs at `http://localhost:3847` with live status updates.

## Architecture

```
src/
├── cli/          # CLI commands (commander)
├── core/         # Orchestrator, Scanner, Planner, Contributor
├── claude/       # Claude Code bridge (subprocess invocation)
├── git/          # Native git operations (clone, branch, commit, push)
├── github/       # GitHub CLI wrappers (issues, PRs)
├── db/           # SQLite persistence (drizzle-orm)
├── dashboard/    # Web UI (Fastify + htmx)
└── utils/        # Logger, subprocess runner
```

**Key design decisions:**

- **SQLite** for persistence — single file, no external process, survives restarts
- **p-queue** for concurrency — process N repos in parallel
- **Claude `--print` mode** — non-interactive subprocess, structured output
- **Native `git` + `gh` CLI** — uses your credentials, your identity

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

TypeScript, Node.js, SQLite (better-sqlite3 + drizzle-orm), Commander, Fastify, htmx, pino, node-cron, p-queue

## License

MIT
