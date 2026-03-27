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

### Step 1: Clone & Install

```bash
git clone https://github.com/JiayuuWang/Contribot.git
cd Contribot
pnpm install
```

### Step 2: Ensure prerequisites are ready

Contribot 依赖三个外部工具，需要提前安装并完成认证。**它们只是前置条件，不需要在后台保持运行**——Contribot 会在运行时自动以子进程方式调用它们。

#### 2a. GitHub CLI — 用于 fork 仓库和创建 PR

```bash
# 安装后，登录你的 GitHub 账号（交互式，按提示操作）
gh auth login
```

完成后可验证：`gh auth status` 应显示你的用户名。

#### 2b. Claude Code — AI 推理引擎

```bash
# 安装 Claude Code CLI（如果还没装的话）
npm install -g @anthropic-ai/claude-code

# 首次运行会启动配置向导，完成 API key 或 OAuth 认证
claude
```

进入 Claude Code 的交互界面说明配置成功。输入 `/exit` 退出即可。**你不需要让 Claude Code 保持运行**——Contribot 运行时会通过 `claude --print` 命令在后台自动调用它。

#### 2c. Git — 确认 git 已配置用户信息

```bash
git config --global user.name   # 应显示你的名字
git config --global user.email  # 应显示你的邮箱
```

### Step 3: Initialize Contribot config

```bash
pnpm dev config init
```

这会在项目根目录生成 `contribot.toml` 配置文件。用编辑器打开它，添加你想贡献的目标仓库：

```toml
[general]
scan_interval_minutes = 60    # 扫描间隔（分钟）
max_concurrent_repos = 3      # 同时处理的仓库数
claude_model = "sonnet"       # Claude 模型（sonnet/opus/haiku）
max_budget_per_task_usd = 0.50  # 每次 Claude 调用的花费上限
dashboard_port = 3847

[github]
username = ""  # 留空则自动从 gh auth 检测

# 添加目标仓库（可添加多个 [[repos]] 块）
[[repos]]
name = "owner/repo"
focus = ["bug-fixes", "tests"]            # 贡献方向
reasons = "Interested in this project"    # 为什么想贡献
issue_labels = ["good first issue", "help wanted"]  # 要关注的 issue 标签
max_prs_per_day = 2
enabled = true
```

### Step 4: Verify everything

```bash
pnpm dev config check
```

全部通过的输出：

```
  ✓ git: git version 2.x.x
  ✓ gh CLI: gh version 2.x.x
  ✓ gh auth: Logged in as yourname
  ✓ claude CLI: x.x.x (Claude Code)
  ✓ contribot.toml: valid

All checks passed! Ready to run.
```

如果某项 ✗ 失败，根据提示安装或认证对应工具即可。

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
