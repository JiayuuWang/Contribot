import { Command } from "commander";
import {
  loadConfig,
  addRepoToConfig,
  removeRepoFromConfig,
  syncReposToDb,
} from "../config.js";
import { getDb } from "../db/connection.js";
import { repos } from "../db/schema.js";
import { eq } from "drizzle-orm";

export function registerRepoCommands(program: Command) {
  const repo = program.command("repo").description("Manage target repositories");

  repo
    .command("add <name>")
    .description("Add a target repository (owner/repo)")
    .option("-f, --focus <items>", "Focus areas (comma-separated, empty = all)")
    .option("-r, --reasons <text>", "Why you want to contribute", "")
    .option("-l, --labels <items>", "Issue labels (comma-separated, empty = all)")
    .option("--max-prs <n>", "Max PRs per day", "2")
    .action(async (name: string, opts) => {
      if (!/^[^/]+\/[^/]+$/.test(name)) {
        console.error("Error: repo name must be in owner/repo format");
        process.exitCode = 1;
        return;
      }

      const focus = opts.focus ? opts.focus.split(",").map((s: string) => s.trim()) : [];
      const labels = opts.labels ? opts.labels.split(",").map((s: string) => s.trim()) : [];

      try {
        // Write to TOML
        addRepoToConfig({
          name,
          focus,
          reasons: opts.reasons,
          issue_labels: labels,
          max_prs_per_day: parseInt(opts.maxPrs, 10),
          enabled: true,
        });

        // Sync TOML → DB
        const config = loadConfig();
        await syncReposToDb(config, config.general.db_path);

        console.log(`Added repo: ${name}`);
        console.log(`  Focus: ${focus.join(", ")}`);
        console.log(`  Labels: ${labels.join(", ")}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });

  repo
    .command("remove <name>")
    .description("Remove a target repository")
    .action(async (name: string) => {
      try {
        // Remove from TOML
        removeRepoFromConfig(name);

        // Sync TOML → DB
        const config = loadConfig();
        await syncReposToDb(config, config.general.db_path);

        console.log(`Removed repo: ${name}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });

  repo
    .command("list")
    .description("List all target repositories")
    .action(async () => {
      try {
        const config = loadConfig();

        // Sync first so DB has latest TOML state
        await syncReposToDb(config, config.general.db_path);

        const db = getDb(config.general.db_path);
        const allRepos = await db.select().from(repos);

        if (allRepos.length === 0) {
          console.log(
            "No repos configured. Add [[repos]] to contribot.toml or use `contribot repo add <owner/repo>`."
          );
          return;
        }

        console.log(`\nTarget Repositories (${allRepos.length}):\n`);
        for (const r of allRepos) {
          const status = r.enabled ? "enabled" : "disabled";
          const lastScan = r.lastScannedAt ?? "never";
          console.log(`  ${r.fullName} [${status}]`);
          console.log(`    Focus: ${JSON.parse(r.focus).join(", ")}`);
          console.log(`    Last scan: ${lastScan}`);
          console.log();
        }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });

  repo
    .command("enable <name>")
    .description("Enable a repository")
    .action(async (name: string) => {
      try {
        const config = loadConfig();
        const db = getDb(config.general.db_path);
        await db.update(repos).set({ enabled: true }).where(eq(repos.fullName, name));
        console.log(`Enabled: ${name}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });

  repo
    .command("disable <name>")
    .description("Disable a repository")
    .action(async (name: string) => {
      try {
        const config = loadConfig();
        const db = getDb(config.general.db_path);
        await db.update(repos).set({ enabled: false }).where(eq(repos.fullName, name));
        console.log(`Disabled: ${name}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
