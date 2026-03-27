import { type ContribotConfig, type RepoConfig } from "../config.js";
import { setupWorkspace, type GitWorkspace } from "../git/repo-manager.js";
import { listIssues, type Issue } from "../github/issues.js";
import { listMyPRs } from "../github/prs.js";
import { invokeClaude } from "../claude/bridge.js";
import { issueAnalysisPrompt, codebaseScanPrompt } from "../claude/prompts.js";
import {
  parseIssueAnalysis,
  parseCodebaseScan,
  type AnalyzedIssue,
  type CodeOpportunity,
} from "../claude/parser.js";
import { getDb } from "../db/connection.js";
import { scans, repos } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";

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
    // 1. Fetch open issues
    const rawIssues = await listIssues(repoConfig.name, repoConfig.issue_labels);
    logger.info({ repo: repoConfig.name, count: rawIssues.length }, "Fetched issues");

    // 2. Filter out issues we already have PRs for
    const myPRs = await listMyPRs(repoConfig.name);
    const prBranches = new Set(myPRs.map((pr) => pr.headRefName));
    const openIssueNumbers = new Set(
      myPRs
        .filter((pr) => pr.state === "OPEN")
        .map((pr) => {
          const match = pr.headRefName.match(/issue-(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean)
    );

    const candidateIssues = rawIssues.filter(
      (issue) => !openIssueNumbers.has(issue.number)
    );

    // 3. Ask Claude to analyze issues
    let analyzedIssues: AnalyzedIssue[] = [];
    if (candidateIssues.length > 0) {
      const prompt = issueAnalysisPrompt(
        candidateIssues.slice(0, 10), // Limit to 10 for cost
        repoConfig.name,
        repoConfig.focus
      );

      const result = await invokeClaude({
        prompt,
        cwd: workspace.localPath,
        outputFormat: "json",
        model: config.general.claude_model,
      });

      if (result.success) {
        analyzedIssues = parseIssueAnalysis(result.output);
        logger.info({ count: analyzedIssues.length }, "Analyzed issues");
      }
    }

    // 4. Scan codebase for opportunities (if focus includes relevant areas)
    let opportunities: CodeOpportunity[] = [];
    const scanFocus = repoConfig.focus.filter((f) =>
      ["tests", "documentation", "refactoring"].includes(f)
    );

    if (scanFocus.length > 0) {
      const prompt = codebaseScanPrompt(repoConfig.name, scanFocus);
      const result = await invokeClaude({
        prompt,
        cwd: workspace.localPath,
        outputFormat: "json",
        model: config.general.claude_model,
        allowedTools: ["Read", "Glob", "Grep"],
      });

      if (result.success) {
        opportunities = parseCodebaseScan(result.output);
        logger.info({ count: opportunities.length }, "Found opportunities");
      }
    }

    // 5. Update scan record
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
