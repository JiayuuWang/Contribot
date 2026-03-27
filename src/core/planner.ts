import { type ContribotConfig, type RepoConfig } from "../config.js";
import { type AnalyzedIssue, type CodeOpportunity } from "../claude/parser.js";
import { type ScanResult } from "./scanner.js";
import { getDb } from "../db/connection.js";
import { contributions } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export interface ContributionPlan {
  type: "fix_issue" | "improve_code" | "add_tests" | "improve_docs";
  description: string;
  issueNumber?: number;
  file?: string;
  branchName: string;
}

export function planContributions(
  scanResult: ScanResult,
  repoConfig: RepoConfig,
  existingPrsToday: number
): ContributionPlan[] {
  const remaining = repoConfig.max_prs_per_day - existingPrsToday;
  if (remaining <= 0) {
    logger.info({ repo: repoConfig.name }, "Daily PR limit reached, skipping");
    return [];
  }

  const plans: ContributionPlan[] = [];

  // Priority 1: Easy issues that match focus
  const easyIssues = scanResult.issues
    .filter((i) => i.feasibility === "easy" && i.matchesFocus)
    .sort((a, b) => (a.feasibility === "easy" ? -1 : 1));

  for (const issue of easyIssues) {
    if (plans.length >= remaining) break;
    plans.push({
      type: "fix_issue",
      description: `Fix issue #${issue.number}: ${issue.title}\n\nApproach: ${issue.suggestedApproach}`,
      issueNumber: issue.number,
      branchName: `contribot/issue-${issue.number}`,
    });
  }

  // Priority 2: Medium issues
  const mediumIssues = scanResult.issues
    .filter((i) => i.feasibility === "medium" && i.matchesFocus);

  for (const issue of mediumIssues) {
    if (plans.length >= remaining) break;
    plans.push({
      type: "fix_issue",
      description: `Fix issue #${issue.number}: ${issue.title}\n\nApproach: ${issue.suggestedApproach}`,
      issueNumber: issue.number,
      branchName: `contribot/issue-${issue.number}`,
    });
  }

  // Priority 3: High-confidence code opportunities
  const highOps = scanResult.opportunities.filter((o) => o.confidence === "high");

  for (const op of highOps) {
    if (plans.length >= remaining) break;
    const slug = op.file
      .replace(/[^a-zA-Z0-9]/g, "-")
      .slice(0, 30)
      .toLowerCase();
    plans.push({
      type: op.type === "tests" ? "add_tests" : op.type === "documentation" ? "improve_docs" : "improve_code",
      description: op.description,
      file: op.file,
      branchName: `contribot/${op.type}-${slug}-${Date.now().toString(36)}`,
    });
  }

  logger.info({ repo: repoConfig.name, plans: plans.length }, "Created contribution plans");
  return plans;
}

export async function countTodaysPRs(repoId: number, dbPath: string): Promise<number> {
  const db = getDb(dbPath);
  const today = new Date().toISOString().split("T")[0];

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(contributions)
    .where(
      and(
        eq(contributions.repoId, repoId),
        eq(contributions.type, "pr"),
        sql`date(${contributions.startedAt}) = ${today}`
      )
    );

  return result[0]?.count ?? 0;
}
