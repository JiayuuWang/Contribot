import { type ContribotConfig, type RepoConfig } from "../config.js";
import { type ContributionPlan } from "./planner.js";
import { type GitWorkspace, prepareContribution, commitAndPush } from "../git/repo-manager.js";
import { hasChanges, stageAll, getDiff } from "../git/commit.js";
import { invokeClaude } from "../claude/bridge.js";
import { contributionPrompt, prDescriptionPrompt } from "../claude/prompts.js";
import { parsePRDescription } from "../claude/parser.js";
import { createPR, type CreatePROptions } from "../github/prs.js";
import { getDb } from "../db/connection.js";
import { contributions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export interface ContributionResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
}

export async function executeContribution(
  plan: ContributionPlan,
  repoConfig: RepoConfig,
  repoId: number,
  workspace: GitWorkspace,
  config: ContribotConfig,
  dryRun = false
): Promise<ContributionResult> {
  const db = getDb(config.general.db_path);

  // Record contribution start
  const [contribution] = await db.insert(contributions).values({
    repoId,
    type: "pr",
    status: "coding",
    issueNumber: plan.issueNumber,
    branchName: plan.branchName,
    title: plan.description.split("\n")[0],
    startedAt: new Date().toISOString(),
  }).returning();

  try {
    // 1. Create branch
    await updateStatus(db, contribution.id, "coding");
    await prepareContribution(workspace, plan.branchName);

    // 2. Invoke Claude to make changes
    const prompt = contributionPrompt(repoConfig.name, {
      type: plan.type,
      description: plan.description,
      issueNumber: plan.issueNumber,
      file: plan.file,
    });

    const claudeResult = await invokeClaude({
      prompt,
      cwd: workspace.localPath,
      model: config.general.claude_model,
      allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
      timeout: 600_000,
      repo: repoConfig.name,
      phase: "contribute",
    });

    if (!claudeResult.success) {
      throw new Error(`Claude failed: ${claudeResult.error}`);
    }

    // 3. Check if changes were made
    const changed = await hasChanges(workspace.localPath);
    if (!changed) {
      throw new Error("Claude made no changes");
    }

    if (dryRun) {
      logger.info({ repo: repoConfig.name, plan: plan.branchName }, "Dry run - skipping PR");
      await updateStatus(db, contribution.id, "completed", { description: "Dry run completed" });
      return { success: true };
    }

    // 4. Stage, commit, push
    await updateStatus(db, contribution.id, "pushing");
    const commitMsg = plan.issueNumber
      ? `fix: ${plan.description.split("\n")[0]} (#${plan.issueNumber})`
      : `improve: ${plan.description.split("\n")[0]}`;

    await commitAndPush(workspace, plan.branchName, commitMsg);

    // 5. Generate PR description
    await stageAll(workspace.localPath);
    const diff = await getDiff(workspace.localPath);

    const descResult = await invokeClaude({
      prompt: prDescriptionPrompt(diff || claudeResult.output, {
        type: plan.type,
        description: plan.description,
        issueNumber: plan.issueNumber,
      }),
      cwd: workspace.localPath,
      outputFormat: "json",
      model: config.general.claude_model,
      repo: repoConfig.name,
      phase: "pr-description",
    });

    let prTitle = commitMsg;
    let prBody = plan.description;

    if (descResult.success) {
      const parsed = parsePRDescription(descResult.output);
      if (parsed) {
        prTitle = parsed.title;
        prBody = parsed.body;
      }
    }

    // 6. Create PR
    const pr = await createPR({
      repo: repoConfig.name,
      head: `${workspace.username}:${plan.branchName}`,
      title: prTitle,
      body: prBody,
    });

    // 7. Update record
    await db
      .update(contributions)
      .set({
        status: "pr_created",
        prNumber: pr.number,
        prUrl: pr.url,
        title: prTitle,
        description: prBody,
        completedAt: new Date().toISOString(),
      })
      .where(eq(contributions.id, contribution.id));

    logger.info({ repo: repoConfig.name, pr: pr.number, url: pr.url }, "PR created");

    return { success: true, prNumber: pr.number, prUrl: pr.url };
  } catch (err: any) {
    logger.error({ err, repo: repoConfig.name, plan: plan.branchName }, "Contribution failed");

    await db
      .update(contributions)
      .set({
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date().toISOString(),
      })
      .where(eq(contributions.id, contribution.id));

    return { success: false, error: err.message };
  }
}

async function updateStatus(
  db: ReturnType<typeof getDb>,
  id: number,
  status: string,
  extra: Record<string, any> = {}
) {
  await db
    .update(contributions)
    .set({ status, ...extra })
    .where(eq(contributions.id, id));
}
