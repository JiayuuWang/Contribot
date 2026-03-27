# Contribot

**[English](README.md)** | **[中文](README.zh-CN.md)** | **[한국어](README.ko.md)**

一个自动为 GitHub 开源仓库做贡献的 CLI 工具，以 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 作为推理引擎。它持续监控你的目标仓库、分析 Issue 和代码，然后以**你自己的 GitHub 账号**提交 PR。

## 工作原理

```
配置目标仓库 → Contribot 扫描 Issue 和代码 →
Claude Code 分析并编写修复 → 以你的身份 Git 提交 →
向上游提交 PR
```

**核心循环：**

1. **扫描** — 获取开放的 Issue，分析代码库中的改进机会
2. **规划** — 按可行性排序，检查每日 PR 限额
3. **贡献** — Claude Code 在隔离的工作区中修改代码
4. **提交** — 提交、推送，通过 `gh` CLI 创建 PR

所有 Git 操作使用原生 `git` 命令。PR 以你的 GitHub 身份创建，而非 Claude 的身份。

## 前置条件

| 工具 | 用途 | 安装 |
|------|------|------|
| **Node.js** >= 18 | 运行时 | [nodejs.org](https://nodejs.org) |
| **pnpm** | 包管理器 | `npm install -g pnpm` |
| **Git** | 版本控制 | [git-scm.com](https://git-scm.com) |
| **GitHub CLI** (`gh`) | Fork 仓库、创建 PR | [cli.github.com](https://cli.github.com) |
| **Claude Code** (`claude`) | AI 推理引擎 | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

## 安装配置

### 第一步：克隆并安装

```bash
git clone https://github.com/JiayuuWang/Contribot.git
cd Contribot
pnpm install
```

### 第二步：确认前置工具已就绪

Contribot 依赖三个外部工具，需要提前安装并完成认证。**它们只是前置条件，不需要在后台保持运行**——Contribot 会在运行时自动以子进程方式调用它们。

#### 2a. GitHub CLI — 用于 Fork 仓库和创建 PR

```bash
# 安装后，登录你的 GitHub 账号（交互式，按提示操作）
gh auth login
```

验证：`gh auth status` 应显示你的用户名。

#### 2b. Claude Code — AI 推理引擎

```bash
# 安装 Claude Code CLI（如果还没装的话）
npm install -g @anthropic-ai/claude-code

# 首次运行会启动配置向导，完成 API key 或 OAuth 认证
claude
```

进入 Claude Code 的交互界面说明配置成功。输入 `/exit` 退出即可。**你不需要让 Claude Code 保持运行**——Contribot 运行时会通过 `claude --print` 命令在后台自动调用它。

#### 2c. Git — 确认 Git 已配置用户信息

```bash
git config --global user.name   # 应显示你的名字
git config --global user.email  # 应显示你的邮箱
```

### 第三步：初始化 Contribot 配置

```bash
pnpm dev config init
```

这会在项目根目录生成 `contribot.toml` 配置文件。用编辑器打开它，添加你想贡献的目标仓库：

```toml
[general]
scan_interval_minutes = 60       # 扫描间隔（分钟）
max_concurrent_repos = 3         # 同时处理的仓库数
claude_model = "sonnet"          # Claude 模型（sonnet/opus/haiku）
max_budget_per_task_usd = 0.50   # 每次 Claude 调用的花费上限
dashboard_port = 3847

[github]
username = ""  # 留空则自动从 gh auth 检测

# 添加目标仓库（可添加多个 [[repos]] 块）
[[repos]]
name = "owner/repo"
focus = ["bug-fixes", "tests"]
reasons = "对这个项目感兴趣"
issue_labels = ["good first issue", "help wanted"]
max_prs_per_day = 2
enabled = true
```

### 第四步：验证配置

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

## 使用方法

### 管理目标仓库

有两种方式添加目标仓库，**任选其一即可**，无需重复操作：

**方式 A：直接编辑 `contribot.toml`**（推荐用于批量配置）

在配置文件中添加 `[[repos]]` 块，启动时 Contribot 会自动同步到数据库。

**方式 B：使用 CLI 命令**（推荐用于快速添加单个仓库）

```bash
# 添加仓库（同时写入 contribot.toml 和数据库）
pnpm dev repo add owner/repo --focus "bug-fixes,tests" --reasons "想要贡献"

# 列出仓库
pnpm dev repo list

# 启用/禁用
pnpm dev repo enable owner/repo
pnpm dev repo disable owner/repo

# 移除
pnpm dev repo remove owner/repo
```

### 运行编排器

```bash
# 启动持续模式（每 N 分钟扫描一次）
pnpm dev run

# 单次扫描后退出
pnpm dev run --once

# 试运行（扫描和规划，不创建 PR）
pnpm dev run --dry-run

# 仅处理指定仓库
pnpm dev run --repo owner/repo

# 同时启动 Web 仪表盘
pnpm dev run --dashboard
```

### 监控

```bash
# CLI 状态
pnpm dev status

# 贡献历史
pnpm dev history

# Web 仪表盘（独立启动）
pnpm dev dashboard
```

仪表盘运行在 `http://localhost:3847`，支持实时状态更新。

## 架构

```
src/
├── cli/          # CLI 命令（commander）
├── core/         # 编排器、扫描器、规划器、贡献者
├── claude/       # Claude Code 桥接（子进程调用）
├── git/          # 原生 Git 操作（clone、branch、commit、push）
├── github/       # GitHub CLI 封装（Issues、PRs）
├── db/           # SQLite 持久化（drizzle-orm）
├── dashboard/    # Web UI（Fastify + htmx）
└── utils/        # 日志、子进程运行器
```

## 安全控制

- `--dry-run` 模式：只扫描和规划，不创建 PR
- 每仓库每日 PR 数量限制（默认 2）
- Claude 每次调用预算上限（`max_budget_per_task_usd`）
- PR 描述中披露 AI 辅助
- 每个仓库使用隔离的工作区
- 优雅退出（SIGINT/SIGTERM）

## 配置参考

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `scan_interval_minutes` | 60 | 扫描周期（分钟） |
| `max_concurrent_repos` | 3 | 最大并行处理仓库数 |
| `claude_model` | sonnet | Claude 分析模型 |
| `max_budget_per_task_usd` | 0.50 | 每次 Claude 调用花费上限 |
| `dashboard_port` | 3847 | 仪表盘 HTTP 端口 |
| `max_prs_per_day` | 2 | 每仓库每日 PR 限额 |

## 技术栈

TypeScript, Node.js, SQLite (better-sqlite3 + drizzle-orm), Commander, Fastify, htmx, pino, node-cron, p-queue

## 许可证

MIT
