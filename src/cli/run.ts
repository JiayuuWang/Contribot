import { Command } from "commander";
import { loadConfig } from "../config.js";
import { getDb, closeDb } from "../db/connection.js";
import { Orchestrator } from "../core/orchestrator.js";
import { startDashboard } from "../dashboard/server.js";
import { logger } from "../utils/logger.js";

export function registerRunCommand(program: Command) {
  program
    .command("run")
    .description("Start the contribution orchestrator")
    .option("--once", "Run a single scan cycle then exit")
    .option("--repo <name>", "Process only one specific repo")
    .option("--dashboard", "Also start the dashboard server")
    .option("--dry-run", "Scan and plan but do not create PRs")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const db = getDb(config.general.db_path);

        logger.info("Starting Contribot...");

        if (opts.dashboard) {
          await startDashboard(config);
          logger.info(`Dashboard: http://localhost:${config.general.dashboard_port}`);
        }

        const orchestrator = new Orchestrator(config, db, {
          once: opts.once,
          repoFilter: opts.repo,
          dryRun: opts.dryRun,
        });

        // Graceful shutdown
        const shutdown = async () => {
          logger.info("Shutting down...");
          await orchestrator.stop();
          closeDb();
          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        await orchestrator.start();

        if (opts.once) {
          closeDb();
        }
      } catch (err: any) {
        logger.error(err, "Failed to start");
        process.exitCode = 1;
      }
    });
}
