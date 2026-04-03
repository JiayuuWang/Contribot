import cron from "node-cron";
import PQueue from "p-queue";
import { resolve } from "path";
import { type ContribotConfig, type RepoConfig, syncReposToDb } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, activityLogs, repoStatus, claudeInstances, claudeOutput, contributions } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { invokeClaude } from "../claude/bridge.js";
import { buildRepoPrompt } from "./repo-prompt.js";
import { getAuthenticatedUser } from "../github/gh-cli.js";
import { logger } from "../utils/logger.js";
import { activityLog, initActivityLogDb } from "../utils/activity-log.js";

export interface OrchestratorOptions {
  once?: boolean;
  repoFilter?: string;
  dryRun?: boolean;
}

export class Orchestrator {
  private config: ContribotConfig;
  private db: ReturnType<typeof getDb>;
  private opts: OrchestratorOptions;
  private queue: PQueue;
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;
  private username = "";

  constructor(
    config: ContribotConfig,
    db: ReturnType<typeof getDb>,
    opts: OrchestratorOptions = {}
  ) {
    this.config = config;
    this.db = db;
    this.opts = opts;
    this.queue = new PQueue({
      concurrency: config.general.max_concurrent_repos,
    });

    // Wire activityLog → SQLite so logs are visible cross-process (dashboard reads DB)
    initActivityLogDb(
      (level, source, repo, message) => {
        this.db.insert(activityLogs).values({
          timestamp: new Date().toISOString(),
          level,
          source,
          repo,
          message: message.slice(0, 2000),
        }).run();
      },
      (repo, phase, currentTask, claudePhase) => {
        this.db.insert(repoStatus).values({
          repoFullName: repo,
          phase,
          currentTask,
          claudePhase,
          updatedAt: new Date().toISOString(),
        }).onConflictDoUpdate({
          target: repoStatus.repoFullName,
          set: { phase, currentTask, claudePhase, updatedAt: new Date().toISOString() },
        }).run();
      },
      // Claude instance writer — persist active instances to DB for cross-process dashboard
      (action, instance) => {
        if (action === "start") {
          this.db.insert(claudeInstances).values({
            id: instance.id,
            repo: instance.repo,
            phase: instance.phase,
            prompt: instance.prompt,
            startedAt: instance.startedAt,
          }).run();
        } else {
          this.db.update(claudeInstances).set({
            endedAt: instance.endedAt,
            durationMs: instance.durationMs,
            success: instance.success,
            error: instance.error,
            costUsd: instance.costUsd,
          }).where(eq(claudeInstances.id, instance.id)).run();
        }
      },
      // Claude output writer — persist per-line output for split-screen dashboard
      (instanceId, stream, line) => {
        this.db.insert(claudeOutput).values({
          instanceId,
          timestamp: new Date().toISOString(),
          stream,
          line: line.slice(0, 4000),
        }).run();
      }
    );
  }

  async start(): Promise<void> {
    this.running = true;

    // Clean stale data from previous sessions
    this.cleanStaleData();

    // Sync TOML repos → DB (single source of truth)
    await syncReposToDb(this.config, this.config.general.db_path);

    // Detect GitHub username
    this.username = this.config.github.username;
    if (!this.username) {
      this.username = await getAuthenticatedUser();
      logger.info({ username: this.username }, "Detected GitHub user");
      activityLog.info("orchestrator", `GitHub user: ${this.username}`);
    }

    if (this.opts.once) {
      await this.runCycle();
      return;
    }

    // Schedule periodic scans
    const minutes = this.config.general.scan_interval_minutes;
    logger.info({ intervalMinutes: minutes }, "Starting orchestrator");

    // Run immediately on start
    await this.runCycle();

    // Then schedule periodic runs
    this.cronJob = cron.schedule(`*/${minutes} * * * *`, () => {
      this.runCycle().catch((err) => {
        logger.error({ err }, "Cycle failed");
      });
    });

    // Keep the process alive
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!this.running) {
          clearInterval(check);
          resolve();
        }
      }, 1000);
    });
  }

  async stop(): Promise<void> {
    logger.info("Stopping orchestrator...");
    this.running = false;

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.queue.pause();
    this.queue.clear();

    logger.info("Orchestrator stopped");
  }

  private async runCycle(): Promise<void> {
    logger.info("Starting scan cycle");
    activityLog.info("orchestrator", "Starting scan cycle");

    const allRepos = await this.db.select().from(repos);
    const enabledRepos = allRepos.filter((r) => r.enabled);

    const filteredRepos = this.opts.repoFilter
      ? enabledRepos.filter((r) => r.fullName === this.opts.repoFilter)
      : enabledRepos;

    if (filteredRepos.length === 0) {
      logger.warn("No repos to process");
      activityLog.warn("orchestrator", "No repos to process — add [[repos]] to contribot.toml");
      return;
    }

    logger.info({ count: filteredRepos.length }, "Processing repos");

    // Enqueue each repo — each gets its own Claude Code instance
    const promises = filteredRepos.map((repo) =>
      this.queue.add(async () => {
        if (!this.running) return;
        await this.processRepo(repo);
      })
    );

    await Promise.allSettled(promises);
    logger.info("Scan cycle complete");
    activityLog.info("orchestrator", "Scan cycle complete");
  }

  /**
   * Process a repo by spawning a single Claude Code instance that handles everything:
   * fork, clone, analyze, code, commit, push, PR creation.
   */
  private async processRepo(
    repoRow: typeof repos.$inferSelect
  ): Promise<void> {
    const repoConfig: RepoConfig = {
      name: repoRow.fullName,
      focus: JSON.parse(repoRow.focus) as any[],
      reasons: repoRow.reasons ?? "",
      issue_labels: JSON.parse(repoRow.issueLabels),
      max_prs_per_day: repoRow.maxPrsPerDay,
      enabled: repoRow.enabled,
    };

    const repo = repoConfig.name;
    logger.info({ repo }, "Processing repo");
    activityLog.info("orchestrator", "Spawning Claude Code instance", repo);
    this.setRepoStatus(repo, "contributing", "Claude Code working on repo");

    try {
      // Build workspace path — Claude will create subdirs if needed
      const workspaceDir = resolve(this.config.general.workspaces_dir);
      const [owner, name] = repo.split("/");
      const repoWorkspace = resolve(workspaceDir, `${owner}__${name}`);

      // Build the comprehensive prompt
      const prompt = buildRepoPrompt(
        repoConfig,
        this.username,
        workspaceDir,
        this.config,
        this.opts.dryRun ?? false,
      );

      // Single Claude Code invocation — does EVERYTHING
      // cwd is the repo workspace root (not source/) so Claude can access notes/logs too
      const result = await invokeClaude({
        prompt,
        cwd: repoWorkspace,
        model: this.config.general.claude_model,
        // Give Claude full tool access to handle the entire workflow
        allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
        timeout: 2700_000, // 45 minutes — repo work takes time
        repo,
        phase: "contribute",
      });

      if (result.success) {
        activityLog.info("orchestrator", "Claude Code instance completed successfully", repo);
        logger.info({ repo }, "Claude Code instance completed");

        // Try to parse the contribution summary from output
        const summary = parseContributionSummary(result.output);
        if (summary) {
          for (const contrib of summary.contributions) {
            await this.db.insert(contributions).values({
              repoId: repoRow.id,
              type: contrib.type === "pr" ? "pr" : "issue",
              status: contrib.prUrl ? "pr_created" : "completed",
              issueNumber: contrib.issueNumber ?? null,
              branchName: contrib.branch ?? null,
              title: contrib.title,
              description: contrib.description,
              prUrl: contrib.prUrl ?? null,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
            activityLog.info("orchestrator", `PR: ${contrib.prUrl ?? contrib.title}`, repo);
          }
          if (summary.analysisNotes) {
            activityLog.info("orchestrator", `Notes: ${summary.analysisNotes}`, repo);
          }
        }
      } else {
        activityLog.error("orchestrator", `Claude Code failed: ${result.error}`, repo);
        logger.error({ repo, error: result.error }, "Claude Code instance failed");
      }

      // Update workspace path in DB (source/ subdir is where git repo lives)
      const localPath = resolve(repoWorkspace, "source");
      await this.db
        .update(repos)
        .set({ localPath, forkCreated: true, lastScannedAt: new Date().toISOString() })
        .where(eq(repos.id, repoRow.id));

      this.setRepoStatus(repo, "idle");
      activityLog.info("orchestrator", "Repo processing complete", repo);
    } catch (err: any) {
      logger.error({ err, repo }, "Failed to process repo");
      activityLog.error("orchestrator", `Failed: ${err.message}`, repo);
      this.setRepoStatus(repo, "idle", `Last error: ${err.message?.slice(0, 80)}`);
    }
  }

  /**
   * Clear stale data from previous sessions so the dashboard starts fresh.
   * - Reset all repo_status to idle
   * - Mark orphaned claude_instances (no endedAt) as failed
   * - Clear old activity_logs and claude_output
   */
  private cleanStaleData() {
    try {
      // Reset all repo statuses to idle
      this.db.update(repoStatus)
        .set({ phase: "idle", currentTask: null, claudePhase: null, updatedAt: new Date().toISOString() })
        .run();

      // Mark any orphaned instances (from crashed previous runs) as failed
      this.db.update(claudeInstances)
        .set({
          endedAt: new Date().toISOString(),
          success: false,
          error: "Orphaned from previous session",
        })
        .where(sql`${claudeInstances.endedAt} IS NULL`)
        .run();

      // Clear old activity logs (keep last 100)
      const keepAfter = this.db.select({ id: activityLogs.id })
        .from(activityLogs)
        .orderBy(sql`${activityLogs.id} DESC`)
        .limit(1)
        .offset(100)
        .all();
      if (keepAfter.length > 0) {
        this.db.delete(activityLogs)
          .where(sql`${activityLogs.id} <= ${keepAfter[0].id}`)
          .run();
      }

      // Clear old claude_output (from completed instances)
      this.db.delete(claudeOutput)
        .where(sql`${claudeOutput.instanceId} IN (
          SELECT ${claudeInstances.id} FROM ${claudeInstances}
          WHERE ${claudeInstances.endedAt} IS NOT NULL
        )`)
        .run();

      logger.info("Cleaned stale data from previous session");
      activityLog.info("orchestrator", "Session started — stale data cleared");
    } catch (err: any) {
      logger.warn({ err: err.message }, "Failed to clean stale data (non-fatal)");
    }
  }

  private setRepoStatus(repo: string, phase: string, currentTask?: string, claudePhase?: string) {
    try {
      this.db.insert(repoStatus).values({
        repoFullName: repo,
        phase,
        currentTask,
        claudePhase,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: repoStatus.repoFullName,
        set: { phase, currentTask, claudePhase, updatedAt: new Date().toISOString() },
      }).run();
    } catch { /* ignore */ }
  }
}

/**
 * Parse the JSON contribution summary from Claude's output.
 * Claude outputs mixed text + JSON, so we need to extract the JSON block.
 */
function parseContributionSummary(output: string): {
  contributions: Array<{
    type: string;
    branch?: string;
    title: string;
    prUrl?: string;
    issueNumber?: number;
    description: string;
  }>;
  analysisNotes?: string;
} | null {
  try {
    // Try to find JSON block in output
    const jsonMatch = output.match(/```json\s*([\s\S]*?)```/) ||
      output.match(/(\{[\s\S]*"contributions"[\s\S]*\})/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.contributions && Array.isArray(parsed.contributions)) {
        return parsed;
      }
    }

    // Try direct parse of entire output
    const parsed = JSON.parse(output);
    if (parsed.contributions && Array.isArray(parsed.contributions)) {
      return parsed;
    }

    // Claude --output-format json wraps in { result: "..." }
    if (parsed.result) {
      const inner = typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result);
      const innerMatch = inner.match(/(\{[\s\S]*"contributions"[\s\S]*\})/);
      if (innerMatch) {
        return JSON.parse(innerMatch[1]);
      }
    }
  } catch {
    // Not parseable — that's fine, Claude may have just done the work without summary
  }
  return null;
}
