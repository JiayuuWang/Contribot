import { type ContribotConfig, type RepoConfig } from "../config.js";

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

  return `You are an autonomous open-source contributor. Your job is to analyze the repository "${repo}" and submit meaningful pull requests.
${dryRunBlock}
${focusDescription}
${reasonsBlock}

## Setup

The workspace directory is: ${workspaceDir}
GitHub username (for fork): ${username}
Upstream repo: ${repo}

First, set up the workspace:

1. Check if the fork exists. If not, run: \`gh repo fork ${repo} --clone=false\`
2. Check if the repo is already cloned at \`${workspaceDir}/${owner}__${name}\`. If not, clone your fork:
   \`git clone https://github.com/${username}/${name}.git ${workspaceDir}/${owner}__${name}\`
3. cd into the workspace directory: \`${workspaceDir}/${owner}__${name}\`
4. Ensure upstream remote exists: \`git remote add upstream https://github.com/${repo}.git\` (ignore if already exists)
5. Sync with upstream: \`git fetch upstream && git checkout main && git reset --hard upstream/main && git push origin main --force\`
   (adjust "main" to "master" if needed)

## Analysis

Now analyze the repository to find contribution opportunities:

### Issues (optional)
${labelFilter}
Run: \`gh issue list --repo ${repo} --state open --limit 10 --json number,title,body,labels,comments\`
- Check which issues already have your PRs: \`gh pr list --repo ${repo} --author @me --json headRefName\`
- Skip issues that already have corresponding PRs.
- Evaluate each issue for feasibility: can it be fixed without deep domain knowledge?

### Codebase Analysis
Read the project structure, key files, and identify improvements:
${unrestricted ? "- Look at ALL areas: tests, documentation, bug fixes, refactoring" : `- Focus on: ${focus.join(", ")}`}
- Missing test coverage
- Missing or outdated documentation
- Obvious bugs, edge cases, error handling gaps
- Code duplication, dead code

## Contribution

Pick the BEST 1-2 opportunities (easy/medium difficulty, high impact) and implement them.
Maximum ${maxPRs} PRs for today.

For each contribution:

1. Create a new branch from upstream/main: \`git checkout -b contribot/<descriptive-name> upstream/main\`
2. Make your changes — edit files, add tests, fix bugs, etc.
3. Follow the project's existing code style and conventions.
4. Do NOT modify CI/CD configs, build files, or project settings.
5. Do NOT add new dependencies unless absolutely necessary.
6. Stage and commit your changes:
   \`git add -A && git commit -m "<type>: <concise description>"\`
7. Push: \`git push origin contribot/<descriptive-name>\`
8. Create a PR:
   \`gh pr create --repo ${repo} --head ${username}:contribot/<branch-name> --title "<title>" --body "<description>"\`
   Include a clear summary and reference any related issues.

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
