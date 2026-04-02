# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Run in dev mode (tsx, no build required)
pnpm dev <command>         # e.g. pnpm dev run, pnpm dev status

# Build to dist/
pnpm build                 # tsc

# Database schema management
pnpm db:generate           # drizzle-kit generate (after schema changes)
pnpm db:migrate            # drizzle-kit migrate
```

There are no automated tests. Manual verification is done via `pnpm dev config check`.

## Architecture

Contribot is a CLI tool that autonomously contributes to GitHub repos using Claude Code as a subprocess reasoning engine. The main loop:

1. **Orchestrator** (`src/core/orchestrator.ts`) — top-level scheduler; syncs TOML config → DB, manages a `p-queue` for concurrent repo processing, runs periodic cycles via `node-cron`.
2. **Scanner** (`src/core/scanner.ts`) — for each repo: fetches GitHub issues via `gh` CLI, asks Claude to rank/analyze them (JSON mode), then scans codebase for code opportunities (tests/docs/refactoring).
3. **Planner** (`src/core/planner.ts`) — filters plans by daily PR limit, focus restrictions, and feasibility scores.
4. **Contributor** (`src/core/contributor.ts`) — invokes Claude Code in the workspace directory to write code, then commits, pushes, and opens a PR via `gh pr create`.
5. **Issue Creator** (`src/core/issue-creator.ts`) — when `focus` includes `"issues"` or is empty, Claude proposes new issues to file on the upstream repo.

### Claude Bridge (`src/claude/bridge.ts`)

All Claude invocations use `claude --print` (non-interactive subprocess). On Windows, the full command string is passed to `shell: true`. Key invocation flags:
- `--output-format json` for structured output
- `--allowedTools` to restrict what Claude can do (scan phase: `Read,Glob,Grep` only)
- `--model` from config (`sonnet`/`opus`/`haiku`)
- Default timeout: 10 minutes per invocation

Claude output is streamed to `activityLog` (in-memory ring buffer) and displayed in the dashboard.

### Configuration (`src/config.ts`)

Config is TOML (`contribot.toml`). Parsed and validated with Zod. **TOML is the single source of truth** — on every `run` start, `syncReposToDb()` reconciles the TOML repos into SQLite (insert new, update changed, delete removed).

The `focus` and `issue_labels` fields default to `[]` (empty array = unrestricted/no filter). Non-empty arrays narrow the scope.

### Database (`src/db/`)

SQLite via `better-sqlite3` + `drizzle-orm`. Schema in `src/db/schema.ts`:
- `repos` — repo config + runtime state (localPath, lastScannedAt, forkCreated)
- `contributions` — PR/issue submission history with cost tracking
- `scans` — scan run records
- `task_queue` — work items with status lifecycle: `pending→in_progress→completed/failed/interrupted`
- `settings` — KV store

DB file defaults to `./data/contribot.db`. Migrations live in `src/db/migrations/`.

### Dashboard (`src/dashboard/`)

Fastify server with htmx for live updates. Served on port 3847 (configurable). Activity log is an in-memory ring buffer (`src/utils/activity-log.ts`) that streams Claude output in real-time to the dashboard.

### Git/GitHub (`src/git/`, `src/github/`)

All git operations are native `git` subprocess calls. GitHub operations use the `gh` CLI. The workspace for each repo lives under `workspaces_dir` (default: `./data/workspaces/`). Each repo is forked to the authenticated user's account before cloning.

## Key Design Constraints

- **Windows compatibility**: CRLF → LF normalization on TOML read; Claude invoked via `shell: true` with escaped args on Windows.
- **Cross-platform**: All subprocess spawning uses platform-aware logic (`isWindows` checks). Paths in prompts are normalized to `/`. `better-sqlite3` is a native addon — `pnpm install` compiles it for the host platform.
- **TLS 1.2 override**: Set `CONTRIBOT_TLS12=1` env var if using an API proxy with TLS 1.3 issues. Without this flag, the system uses the default TLS version (works for direct Anthropic API access on Linux/Mac).
- **No build step for dev**: Use `pnpm dev` (tsx) for all local development.
- **JSON arrays in DB**: `focus` and `issue_labels` are stored as JSON strings in SQLite and parsed on read.
- **Daily PR limits** are enforced by counting `contributions` rows with `type='pr'` and `status='pr_created'` created today.
