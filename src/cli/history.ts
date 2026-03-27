import { Command } from "commander";
import { loadConfig } from "../config.js";
import { getDb } from "../db/connection.js";
import { contributions, repos } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";

export function registerHistoryCommand(program: Command) {
  program
    .command("history")
    .description("Show contribution history")
    .option("-n, --limit <n>", "Number of entries", "20")
    .option("-r, --repo <name>", "Filter by repo")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const db = getDb(config.general.db_path);

        let query = db
          .select({
            id: contributions.id,
            repoName: repos.fullName,
            type: contributions.type,
            status: contributions.status,
            title: contributions.title,
            prUrl: contributions.prUrl,
            startedAt: contributions.startedAt,
            completedAt: contributions.completedAt,
          })
          .from(contributions)
          .innerJoin(repos, eq(contributions.repoId, repos.id))
          .orderBy(desc(contributions.createdAt))
          .limit(parseInt(opts.limit, 10));

        const results = await query;

        if (results.length === 0) {
          console.log("No contributions yet.");
          return;
        }

        console.log("\n=== Contribution History ===\n");
        for (const c of results) {
          const statusIcon =
            c.status === "pr_created" || c.status === "merged"
              ? "✓"
              : c.status === "failed"
              ? "✗"
              : "◎";
          console.log(`  ${statusIcon} [${c.type}] ${c.repoName}`);
          console.log(`    ${c.title ?? "Untitled"}`);
          console.log(`    Status: ${c.status} | ${c.startedAt}`);
          if (c.prUrl) console.log(`    PR: ${c.prUrl}`);
          console.log();
        }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
