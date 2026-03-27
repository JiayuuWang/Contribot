import cron from "node-cron";
import PQueue from "p-queue";
import { type ContribotConfig, type RepoConfig, syncReposToDb } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, taskQueue } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { setupWorkspace } from "../git/repo-manager.js";
import { scanRepo, type ScanResult } from "./scanner.js";
import { planContributions, countTodaysPRs, type ContributionPlan } from "./planner.js";
import { executeContribution } from "./contributor.js";
import { proposeAndCreateIssues } from "./issue-creator.js";
import { getAuthenticatedUser } from "../github/gh-cli.js";
import { logger } from "../utils/logger.js";
import { activityLog } from "../utils/activity-log.js";

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

    // Mark interrupted tasks from previous run
    await this.db
      .update(taskQueue)
      .set({ status: "interrupted" })
      .where(eq(taskQueue.status, "in_progress"));

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

    // Wait for current queue to drain (with timeout)
    this.queue.pause();
    this.queue.clear();

    // Mark in-progress tasks as interrupted
    await this.db
      .update(taskQueue)
      .set({ status: "interrupted" })
      .where(eq(taskQueue.status, "in_progress"));

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

    logger.info({ repo: repoConfig.name }, "Processing repo");
    activityLog.info("orchestrator", `Processing repo`, repoConfig.name);

    try {
      // 1. Setup workspace (fork + clone + sync)
      const workspace = await setupWorkspace(
        repoConfig.name,
        this.config.general.workspaces_dir,
        this.username
      );

      // Update local path in DB
      await this.db
        .update(repos)
        .set({ localPath: workspace.localPath, forkCreated: true })
        .where(eq(repos.id, repoRow.id));

      // 2. Scan
      const scanResult = await scanRepo(
        repoConfig,
        repoRow.id,
        workspace,
        this.config
      );

      // 3. Plan
      const todaysPRs = await countTodaysPRs(repoRow.id, this.config.general.db_path);
      const plans = planContributions(scanResult, repoConfig, todaysPRs);

      // 4. Execute contributions
      for (const plan of plans) {
        if (!this.running) break;

        const result = await executeContribution(
          plan,
          repoConfig,
          repoRow.id,
          workspace,
          this.config,
          this.opts.dryRun
        );

        if (result.success) {
          logger.info(
            { repo: repoConfig.name, pr: result.prUrl },
            "Contribution succeeded"
          );
        } else {
          logger.warn(
            { repo: repoConfig.name, error: result.error },
            "Contribution failed"
          );
        }
      }

      // 5. Optionally create issues
      await proposeAndCreateIssues(
        repoConfig,
        repoRow.id,
        workspace,
        this.config,
        this.opts.dryRun
      );
    } catch (err: any) {
      logger.error({ err, repo: repoConfig.name }, "Failed to process repo");
    }
  }
}
