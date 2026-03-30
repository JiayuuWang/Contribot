import cron from "node-cron";
import PQueue from "p-queue";
import { type ContribotConfig, type RepoConfig, syncReposToDb } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, activityLogs, repoStatus, claudeInstances, claudeOutput } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { setupWorkspace } from "../git/repo-manager.js";
import { scanRepo, type ScanResult } from "./scanner.js";
import { planContributions, countTodaysPRs, type ContributionPlan } from "./planner.js";
import { executeContribution } from "./contributor.js";
import { proposeAndCreateIssues } from "./issue-creator.js";
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

    // Enqueue each repo
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
    activityLog.info("orchestrator", "Processing repo", repo);
    this.setRepoStatus(repo, "scanning", "Setting up workspace");

    try {
      // 1. Setup workspace
      activityLog.info("orchestrator", "Setting up workspace (fork + clone + sync)", repo);
      const workspace = await setupWorkspace(
        repoConfig.name,
        this.config.general.workspaces_dir,
        this.username
      );

      await this.db
        .update(repos)
        .set({ localPath: workspace.localPath, forkCreated: true })
        .where(eq(repos.id, repoRow.id));

      // 2. Analyze — single Claude call: codebase + issues (issues are optional)
      this.setRepoStatus(repo, "scanning", "Analyzing repo");
      activityLog.info("orchestrator", "Analyzing repo (codebase + issues)", repo);
      const scanResult = await scanRepo(repoConfig, repoRow.id, workspace, this.config);
      activityLog.info("orchestrator",
        `Analysis complete: ${scanResult.issues.length} issues, ${scanResult.opportunities.length} opportunities`, repo);

      // 3. Plan
      this.setRepoStatus(repo, "planning", "Planning contributions");
      const todaysPRs = await countTodaysPRs(repoRow.id, this.config.general.db_path);
      const plans = planContributions(scanResult, repoConfig, todaysPRs);
      activityLog.info("orchestrator", `Planned ${plans.length} contributions (${todaysPRs} PRs today, limit ${repoConfig.max_prs_per_day})`, repo);

      // 4. Execute contributions
      for (const plan of plans) {
        if (!this.running) break;
        this.setRepoStatus(repo, "contributing", plan.description.split("\n")[0].slice(0, 80));
        activityLog.info("orchestrator", `Contributing: ${plan.branchName}`, repo);

        const result = await executeContribution(
          plan, repoConfig, repoRow.id, workspace, this.config, this.opts.dryRun
        );

        if (result.success) {
          activityLog.info("orchestrator", `PR created: ${result.prUrl}`, repo);
          logger.info({ repo, pr: result.prUrl }, "Contribution succeeded");
        } else {
          activityLog.warn("orchestrator", `Contribution failed: ${result.error}`, repo);
          logger.warn({ repo, error: result.error }, "Contribution failed");
        }
      }

      // 5. Optionally create issues (only if focus includes "issues" or is empty)
      if (!this.opts.dryRun) {
        this.setRepoStatus(repo, "issue-creating", "Proposing new issues");
      }
      await proposeAndCreateIssues(repoConfig, repoRow.id, workspace, this.config, this.opts.dryRun);

      this.setRepoStatus(repo, "idle");
      activityLog.info("orchestrator", "Repo processing complete", repo);
    } catch (err: any) {
      logger.error({ err, repo }, "Failed to process repo");
      activityLog.error("orchestrator", `Failed: ${err.message}`, repo);
      this.setRepoStatus(repo, "idle", `Last error: ${err.message?.slice(0, 80)}`);
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
