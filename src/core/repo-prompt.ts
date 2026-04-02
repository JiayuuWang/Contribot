import { type ContribotConfig, type RepoConfig } from "../config.js";

/**
 * Workspace directory structure per repo:
 *
 *   workspaces_dir/
 *   └── owner__repo/
 *       ├── source/          ← git clone of the forked repo (actual code)
 *       ├── .claude/         ← Claude Code session data, CLAUDE.md overrides
 *       ├── logs/            ← per-session work logs (timestamped)
 *       └── notes.md         ← persistent analysis notes across sessions
 */

/**
 * Build the master prompt that tells a Claude Code instance to autonomously
 * contribute to a given repo.  The instance will handle everything:
 * fork, clone/pull, analyze, code, commit, push, and PR creation.
 */
export function buildRepoPrompt(
  repoConfig: RepoConfig,
  username: string,
  workspaceDir: string,
  config: ContribotConfig,
  dryRun: boolean,
): string {
  const repo = repoConfig.name;
  const [owner, name] = repo.split("/");
  const focus = repoConfig.focus;
  const unrestricted = focus.length === 0;
  const reasons = repoConfig.reasons;
  const maxPRs = repoConfig.max_prs_per_day;
  const labels = repoConfig.issue_labels;

  const repoDir = `${workspaceDir}/${owner}__${name}`.replace(/\\/g, "/");
  const sourceDir = `${repoDir}/source`;
  const logsDir = `${repoDir}/logs`;
  const notesFile = `${repoDir}/notes.md`;

  const focusDescription = unrestricted
    ? "You are open to ALL types of contributions: bug fixes, tests, documentation, refactoring, features."
    : `Focus ONLY on these areas: ${focus.join(", ")}.`;

  const reasonsBlock = reasons
    ? `\nAdditional context from the user: ${reasons}\n`
    : "";

  const labelFilter = labels.length > 0
    ? `When fetching issues, filter by these labels: ${labels.join(", ")}.`
    : "Fetch all open issues without label filtering.";

  const dryRunBlock = dryRun
    ? `\n**DRY RUN MODE**: Do NOT actually push or create PRs. Just analyze and report what you would do.\n`
    : "";

  const sessionId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return `You are an autonomous open-source contributor. Your job is to analyze the repository "${repo}" and submit meaningful pull requests.
${dryRunBlock}
${focusDescription}
${reasonsBlock}

## Workspace Structure

Your workspace is organized as follows:
- \`${repoDir}/\` — workspace root for this repo
- \`${sourceDir}/\` — git clone of the repo (source code lives here)
- \`${logsDir}/\` — work logs from each session
- \`${notesFile}\` — persistent notes about the repo (read this first if it exists!)

## Setup

GitHub username (for fork): ${username}
Upstream repo: ${repo}
Session ID: ${sessionId}

### Step 1: Prepare workspace directories
\`\`\`bash
mkdir -p "${sourceDir}" "${logsDir}"
\`\`\`

### Step 2: Check for existing work
If \`${notesFile}\` exists, read it first — it contains analysis and progress from previous sessions. Continue where you left off rather than starting from scratch.

If \`${sourceDir}/.git\` exists, the repo is already cloned. Just sync it:
\`\`\`bash
cd "${sourceDir}"
git fetch upstream
git checkout main || git checkout master
git reset --hard upstream/main || git reset --hard upstream/master
git push origin main --force || git push origin master --force
\`\`\`

### Step 3: Clone if new
If \`${sourceDir}/.git\` does NOT exist:
1. Fork: \`gh repo fork ${repo} --clone=false\` (ignore if already forked)
2. Clone: \`git clone https://github.com/${username}/${name}.git "${sourceDir}"\`
3. Add upstream: \`cd "${sourceDir}" && git remote add upstream https://github.com/${repo}.git\`
4. Fetch: \`git fetch upstream\`

### Step 4: Set working directory
All subsequent file operations should be done within \`${sourceDir}\`.
\`cd "${sourceDir}"\`

## Analysis

Analyze the repository to find contribution opportunities:

### Read previous notes
If \`${notesFile}\` exists, read it to understand what was already analyzed and done.

### Issues (optional)
${labelFilter}
Run: \`gh issue list --repo ${repo} --state open --limit 10 --json number,title,body,labels,comments\`
- Check existing PRs: \`gh pr list --repo ${repo} --author @me --json headRefName,state\`
- Skip issues that already have corresponding open PRs.

### Codebase Analysis
Read the project structure, key files, and identify improvements:
${unrestricted ? "- Look at ALL areas: tests, documentation, bug fixes, refactoring" : `- Focus on: ${focus.join(", ")}`}

## Contribution

Pick the BEST 1-2 opportunities (easy/medium difficulty, high impact) and implement them.
Maximum ${maxPRs} PRs for today.

For each contribution:

1. Create a branch: \`git checkout -b contribot/<descriptive-name> upstream/main\` (or upstream/master)
2. Make your changes within \`${sourceDir}\` — edit files, add tests, fix bugs.
3. Follow the project's existing code style and conventions.
4. Do NOT modify CI/CD configs, build files, or project settings.
5. Do NOT add new dependencies unless absolutely necessary.
6. Stage and commit: \`git add -A && git commit -m "<type>: <concise description>"\`
7. Push: \`git push origin contribot/<descriptive-name>\`
8. Create PR: \`gh pr create --repo ${repo} --head ${username}:contribot/<branch-name> --title "<title>" --body "<description>"\`

## Post-work

### Save session notes
After finishing, update \`${notesFile}\` with:
- What you analyzed and found
- What you contributed (PRs created, branches)
- What opportunities remain for future sessions
- Any issues or blockers encountered

### Save session log
Write a brief session log to \`${logsDir}/${sessionId}.md\` with what was done.

## Output

After completing all work, output a JSON summary:
\`\`\`json
{
  "contributions": [
    {
      "type": "pr",
      "branch": "contribot/...",
      "title": "PR title",
      "prUrl": "https://github.com/...",
      "issueNumber": null,
      "description": "what was done"
    }
  ],
  "analysisNotes": "brief notes on what you found and why you chose these contributions"
}
\`\`\`

If no good opportunities were found, return an empty contributions array with an explanation in analysisNotes.

IMPORTANT: Be a good open source citizen. Make minimal, well-tested, well-documented changes.`;
}
