# Contribot

**[English](README.md)** | **[中文](README.zh-CN.md)** | **[한국어](README.ko.md)**

[Claude Code](https://docs.anthropic.com/en/docs/claude-code)를 추론 엔진으로 사용하여 GitHub 오픈소스 저장소에 자동으로 기여하는 CLI 도구입니다. 대상 저장소를 지속적으로 모니터링하고, 이슈와 코드베이스를 분석한 후, **본인의 GitHub 계정**으로 PR을 제출합니다.

## 작동 방식

```
대상 저장소 설정 → Contribot이 이슈 & 코드 스캔 →
Claude Code가 분석 & 수정 작성 → 본인 계정으로 Git 커밋 →
업스트림에 PR 제출
```

**핵심 루프:**

1. **스캔** — 오픈 이슈 수집, 코드베이스에서 개선 기회 분석
2. **계획** — 실현 가능성 순으로 정렬, 일일 PR 한도 확인
3. **기여** — Claude Code가 격리된 작업 공간에서 코드 변경
4. **제출** — 커밋, 푸시, `gh` CLI로 PR 생성

모든 Git 작업은 네이티브 `git` 명령어를 사용합니다. PR은 Claude가 아닌 본인의 GitHub 계정으로 생성됩니다.

## 사전 요구 사항

| 도구 | 용도 | 설치 |
|------|------|------|
| **Node.js** >= 18 | 런타임 | [nodejs.org](https://nodejs.org) |
| **pnpm** | 패키지 매니저 | `npm install -g pnpm` |
| **Git** | 버전 관리 | [git-scm.com](https://git-scm.com) |
| **GitHub CLI** (`gh`) | 저장소 포크, PR 생성 | [cli.github.com](https://cli.github.com) |
| **Claude Code** (`claude`) | AI 추론 엔진 | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

## 설정

### 1단계: 클론 및 설치

```bash
git clone https://github.com/JiayuuWang/Contribot.git
cd Contribot
pnpm install
```

### 2단계: 사전 요구 도구 확인

Contribot은 세 가지 외부 도구에 의존합니다. 미리 설치하고 인증을 완료하세요. **이 도구들은 사전 요구 사항일 뿐, 백그라운드에서 실행할 필요가 없습니다.** Contribot이 런타임에 자동으로 서브프로세스로 호출합니다.

#### 2a. GitHub CLI — 저장소 포크 및 PR 생성용

```bash
# 설치 후, GitHub 계정으로 로그인 (대화형)
gh auth login
```

확인: `gh auth status`에 사용자 이름이 표시되어야 합니다.

#### 2b. Claude Code — AI 추론 엔진

```bash
# Claude Code CLI 설치 (아직 설치하지 않은 경우)
npm install -g @anthropic-ai/claude-code

# 처음 실행하면 API 키 또는 OAuth 설정 마법사가 시작됩니다
claude
```

대화형 인터페이스가 표시되면 설정이 완료된 것입니다. `/exit`을 입력하여 종료하세요. **Claude Code를 계속 실행할 필요가 없습니다.** Contribot이 `claude --print`를 통해 백그라운드에서 자동으로 호출합니다.

#### 2c. Git — 사용자 설정 확인

```bash
git config --global user.name   # 이름이 표시되어야 합니다
git config --global user.email  # 이메일이 표시되어야 합니다
```

### 3단계: Contribot 설정 초기화

```bash
pnpm dev config init
```

프로젝트 루트에 `contribot.toml`이 생성됩니다. 편집기로 열어 대상 저장소를 추가하세요:

```toml
[general]
scan_interval_minutes = 60       # 스캔 간격 (분)
max_concurrent_repos = 3         # 병렬 저장소 처리 수
claude_model = "sonnet"          # Claude 모델 (sonnet/opus/haiku)
max_budget_per_task_usd = 0.50   # Claude 호출당 비용 상한
dashboard_port = 3847

[github]
username = ""  # 비워두면 gh auth에서 자동 감지

# name만 필수입니다. 나머지 필드는 기본값이 있습니다.
[[repos]]
name = "owner/repo"
```

#### 저장소 필드 참조

| 필드 | 필수 | 기본값 | 효과 |
|------|------|--------|------|
| `name` | **예** | — | `owner/repo` 형식의 GitHub 저장소 |
| `focus` | 아니오 | `[]` (제한 없음) | 기여 유형. **비워두면 제한 없음**, 모든 영역에서 기여 기회를 찾습니다. 값을 지정하면 해당 영역만 탐색: `bug-fixes`, `tests`, `documentation`, `refactoring`, `features`, `issues` |
| `reasons` | 아니오 | `""` | Claude에 전달되는 컨텍스트. 왜 기여하고 싶은지 설명하여 더 나은 판단을 돕습니다 |
| `issue_labels` | 아니오 | `[]` (필터 없음) | 이슈 필터링에 사용할 GitHub 레이블. **비워두면 필터 없음**, 모든 오픈 이슈가 스캔됩니다. 레이블을 지정하면 해당 레이블의 이슈만 스캔 |
| `max_prs_per_day` | 아니오 | `2` | 이 저장소의 일일 PR 상한. `0`으로 설정하면 스캔은 계속하지만 PR 생성은 중지됩니다 |
| `enabled` | 아니오 | `true` | `false`로 설정하면 스캔 주기에서 이 저장소를 건너뜁니다 |

> **`focus`에 대해:** 비워두면 Contribot은 새 이슈 생성을 포함한 모든 영역에서 기여합니다. 지정하면 나열된 유형으로만 제한됩니다 — 예: `["bug-fixes", "tests"]`는 버그 수정과 테스트 추가만 하며, `"issues"`를 명시적으로 포함하지 않으면 새 이슈를 **생성하지 않습니다**.

### 4단계: 설정 확인

```bash
pnpm dev config check
```

예상 출력:

```
  ✓ git: git version 2.x.x
  ✓ gh CLI: gh version 2.x.x
  ✓ gh auth: Logged in as yourname
  ✓ claude CLI: x.x.x (Claude Code)
  ✓ contribot.toml: valid

All checks passed! Ready to run.
```

검사가 실패하면 해당 도구를 설치하거나 인증하세요.

## 사용법

### 대상 저장소 관리

대상 저장소를 추가하는 두 가지 방법이 있습니다 — **하나만 선택하면 됩니다:**

**방법 A: `contribot.toml` 직접 편집** (대량 설정에 권장)

설정 파일에 `[[repos]]` 블록을 추가하면 시작 시 Contribot이 자동으로 데이터베이스에 동기화합니다.

**방법 B: CLI 명령어 사용** (단일 저장소 빠른 추가에 권장)

```bash
# 저장소 추가 (contribot.toml과 데이터베이스에 동시 기록)
pnpm dev repo add owner/repo --focus "bug-fixes,tests" --reasons "기여하고 싶습니다"

# 저장소 목록
pnpm dev repo list

# 활성화/비활성화
pnpm dev repo enable owner/repo
pnpm dev repo disable owner/repo

# 제거
pnpm dev repo remove owner/repo
```

### 오케스트레이터 실행

```bash
# 지속 모드 시작 (N분마다 스캔)
pnpm dev run

# 단일 스캔 후 종료
pnpm dev run --once

# 드라이 런 (스캔 및 계획만, PR 생성 안 함)
pnpm dev run --dry-run

# 특정 저장소만 처리
pnpm dev run --repo owner/repo

# 웹 대시보드와 함께 시작
pnpm dev run --dashboard
```

### 모니터링

```bash
# CLI 상태
pnpm dev status

# 기여 이력
pnpm dev history

# 웹 대시보드 (단독 시작)
pnpm dev dashboard
```

대시보드는 `http://localhost:3847`에서 실행되며, 실시간 상태 업데이트를 지원합니다.

## 아키텍처

```
src/
├── cli/          # CLI 명령어 (commander)
├── core/         # 오케스트레이터, 스캐너, 플래너, 컨트리뷰터
├── claude/       # Claude Code 브릿지 (서브프로세스 호출)
├── git/          # 네이티브 Git 작업 (clone, branch, commit, push)
├── github/       # GitHub CLI 래퍼 (Issues, PRs)
├── db/           # SQLite 영속성 (drizzle-orm)
├── dashboard/    # 웹 UI (Fastify + htmx)
└── utils/        # 로거, 서브프로세스 러너
```

## 안전 제어

- `--dry-run` 모드: PR 생성 없이 스캔 및 계획만
- 저장소별 일일 PR 수 제한 (기본값 2)
- Claude 호출당 예산 상한 (`max_budget_per_task_usd`)
- PR 설명에 AI 지원 공개
- 저장소별 격리된 작업 공간
- 정상 종료 (SIGINT/SIGTERM)

## 설정 참조

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `scan_interval_minutes` | 60 | 스캔 주기 (분) |
| `max_concurrent_repos` | 3 | 최대 병렬 처리 저장소 수 |
| `claude_model` | sonnet | Claude 분석 모델 |
| `max_budget_per_task_usd` | 0.50 | Claude 호출당 비용 상한 |
| `dashboard_port` | 3847 | 대시보드 HTTP 포트 |
| `max_prs_per_day` | 2 | 저장소별 일일 PR 한도 |

## 기술 스택

TypeScript, Node.js, SQLite (better-sqlite3 + drizzle-orm), Commander, Fastify, htmx, pino, node-cron, p-queue

## 라이선스

MIT
