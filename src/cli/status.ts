import { Command } from "commander";
import { loadConfig } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, contributions, taskQueue } from "../db/schema.js";
import { eq, count, and } from "drizzle-orm";

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Show current status")
    .action(async () => {
      try {
        const config = loadConfig();
        const db = getDb(config.general.db_path);

        const allRepos = await db.select().from(repos);
        const activeTasks = await db
          .select()
          .from(taskQueue)
          .where(eq(taskQueue.status, "in_progress"));
        const pendingTasks = await db
          .select()
          .from(taskQueue)
          .where(eq(taskQueue.status, "pending"));

        console.log("\n=== Contribot Status ===\n");
        console.log(`Repos: ${allRepos.length} (${allRepos.filter((r) => r.enabled).length} enabled)`);
        console.log(`Active tasks: ${activeTasks.length}`);
        console.log(`Pending tasks: ${pendingTasks.length}`);

        if (activeTasks.length > 0) {
          console.log("\nActive Tasks:");
          for (const task of activeTasks) {
            const repo = allRepos.find((r) => r.id === task.repoId);
            console.log(`  [${task.type}] ${repo?.fullName ?? "unknown"} - started ${task.startedAt}`);
          }
        }

        console.log("\nRepositories:");
        for (const r of allRepos) {
          const status = r.enabled ? "✓" : "✗";
          const lastScan = r.lastScannedAt ?? "never";
          console.log(`  ${status} ${r.fullName} (last scan: ${lastScan})`);
        }
        console.log();
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
