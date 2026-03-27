import { type ContribotConfig, type RepoConfig } from "../config.js";
import { type GitWorkspace } from "../git/repo-manager.js";
import { invokeClaude } from "../claude/bridge.js";
import { createIssue } from "../github/issues.js";
import { getDb } from "../db/connection.js";
import { contributions } from "../db/schema.js";
import { logger } from "../utils/logger.js";

export interface IssueProposal {
  title: string;
  body: string;
  labels: string[];
}

export async function proposeAndCreateIssues(
  repoConfig: RepoConfig,
  repoId: number,
  workspace: GitWorkspace,
  config: ContribotConfig,
  dryRun = false
): Promise<void> {
  // Empty focus = unrestricted, allow issue creation
  // Non-empty focus = only create issues if "issues" is explicitly listed
  if (repoConfig.focus.length > 0 && !repoConfig.focus.includes("issues")) return;

  const prompt = `You are analyzing the codebase of "${repoConfig.name}" to find issues worth reporting.

Look for:
- Bugs or potential bugs
- Missing error handling
- Performance issues
- Security concerns
- Broken or outdated documentation references

Only report clear, well-defined issues. Do not report style preferences.

Respond with a JSON array of issue proposals:
[
  {
    "title": "concise issue title",
    "body": "detailed description with steps to reproduce if applicable",
    "labels": ["bug"]
  }
]

Maximum 3 issues. If none found, respond with an empty array [].
Respond with ONLY the JSON array.`;

  const result = await invokeClaude({
    prompt,
    cwd: workspace.localPath,
    outputFormat: "json",
    model: config.general.claude_model,
    allowedTools: ["Read", "Glob", "Grep"],
  });

  if (!result.success) return;

  let proposals: IssueProposal[] = [];
  try {
    proposals = JSON.parse(result.output);
    if (!Array.isArray(proposals)) return;
  } catch {
    return;
  }

  if (dryRun) {
    for (const p of proposals) {
      logger.info({ title: p.title }, "Dry run: would create issue");
    }
    return;
  }

  const db = getDb(config.general.db_path);

  for (const proposal of proposals.slice(0, 2)) {
    try {
      const issue = await createIssue(
        repoConfig.name,
        proposal.title,
        proposal.body,
        proposal.labels
      );

      await db.insert(contributions).values({
        repoId,
        type: "issue",
        status: "completed",
        issueNumber: issue.number,
        title: proposal.title,
        description: proposal.body,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      logger.info({ repo: repoConfig.name, issue: issue.number }, "Created issue");
    } catch (err: any) {
      logger.error({ err, title: proposal.title }, "Failed to create issue");
    }
  }
}
