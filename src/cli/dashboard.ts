import { Command } from "commander";
import { loadConfig } from "../config.js";
import { startDashboard } from "../dashboard/server.js";
import { logger } from "../utils/logger.js";

export function registerDashboardCommand(program: Command) {
  program
    .command("dashboard")
    .description("Start the web dashboard")
    .option("-p, --port <n>", "Port number")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        if (opts.port) {
          config.general.dashboard_port = parseInt(opts.port, 10);
        }

        await startDashboard(config);
        logger.info(`Dashboard running at http://localhost:${config.general.dashboard_port}`);
        logger.info("Press Ctrl+C to stop.");
      } catch (err: any) {
        logger.error(err, "Failed to start dashboard");
        process.exitCode = 1;
      }
    });
}
