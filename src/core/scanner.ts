import { type ContribotConfig, type RepoConfig } from "../config.js";
import { type GitWorkspace } from "../git/repo-manager.js";
import { listIssues, type Issue } from "../github/issues.js";
import { listMyPRs } from "../github/prs.js";
import { invokeClaude } from "../claude/bridge.js";
import { repoAnalysisPrompt } from "../claude/prompts.js";
import { parseRepoAnalysis, type AnalyzedIssue, type CodeOpportunity } from "../claude/parser.js";
import { getDb } from "../db/connection.js";
import { scans, repos } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { activityLog } from "../utils/activity-log.js";

export interface ScanResult {
  repoId: number;
  issues: AnalyzedIssue[];
  opportunities: CodeOpportunity[];
}

export async function scanRepo(
  repoConfig: RepoConfig,
  repoId: number,
  workspace: GitWorkspace,
  config: ContribotConfig
): Promise<ScanResult> {
  const dbPath = config.general.db_path;
  const db = getDb(dbPath);

  // Record scan start
  const [scan] = await db.insert(scans).values({
    repoId,
    status: "running",
    startedAt: new Date().toISOString(),
  }).returning();

  try {
    // 1. Optionally fetch open issues (best-effort, not required)
    let candidateIssues: Issue[] = [];
    try {
      const rawIssues = await listIssues(repoConfig.name, repoConfig.issue_labels);
      logger.info({ repo: repoConfig.name, count: rawIssues.length }, "Fetched issues");

      // Filter out issues we already have PRs for
      const myPRs = await listMyPRs(repoConfig.name);
      const openIssueNumbers = new Set(
        myPRs
          .filter((pr) => pr.state === "OPEN")
          .map((pr) => {
            const match = pr.headRefName.match(/issue-(\d+)/);
            return match ? parseInt(match[1], 10) : null;
          })
          .filter(Boolean)
      );

      candidateIssues = rawIssues.filter(
        (issue) => !openIssueNumbers.has(issue.number)
      );
    } catch (err: any) {
      // Issues are optional — log and continue
      logger.warn({ repo: repoConfig.name, err: err.message }, "Failed to fetch issues, continuing without them");
      activityLog.warn("scanner", `Issue fetch failed (non-fatal): ${err.message}`, repoConfig.name);
    }

    // 2. Single Claude call: analyze repo + issues together
    activityLog.info("scanner", `Analyzing repo (${candidateIssues.length} issues available)`, repoConfig.name);

    const prompt = repoAnalysisPrompt(
      repoConfig.name,
      repoConfig.focus,
      repoConfig.reasons,
      candidateIssues.slice(0, 10),
    );

    const result = await invokeClaude({
      prompt,
      cwd: workspace.localPath,
      outputFormat: "json",
      model: config.general.claude_model,
      allowedTools: ["Read", "Glob", "Grep"],
      repo: repoConfig.name,
      phase: "analyze",
    });

    let analyzedIssues: AnalyzedIssue[] = [];
    let opportunities: CodeOpportunity[] = [];

    if (result.success) {
      const parsed = parseRepoAnalysis(result.output);
      analyzedIssues = parsed.issues;
      opportunities = parsed.opportunities;
      logger.info(
        { issues: analyzedIssues.length, opportunities: opportunities.length },
        "Analysis complete"
      );
    }

    // 3. Update scan record
    await db
      .update(scans)
      .set({
        status: "completed",
        issuesFound: analyzedIssues.length,
        opportunitiesFound: opportunities.length,
        result: JSON.stringify({ issues: analyzedIssues, opportunities }),
        completedAt: new Date().toISOString(),
      })
      .where(eq(scans.id, scan.id));

    // Update repo's last scanned time
    await db
      .update(repos)
      .set({ lastScannedAt: new Date().toISOString() })
      .where(eq(repos.id, repoId));

    return { repoId, issues: analyzedIssues, opportunities };
  } catch (err: any) {
    await db
      .update(scans)
      .set({
        status: "failed",
        completedAt: new Date().toISOString(),
      })
      .where(eq(scans.id, scan.id));

    logger.error({ err, repo: repoConfig.name }, "Scan failed");
    throw err;
  }
}
