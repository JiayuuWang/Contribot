import { Command } from "commander";
import { registerRepoCommands } from "./repo.js";
import { registerRunCommand } from "./run.js";
import { registerStatusCommand } from "./status.js";
import { registerHistoryCommand } from "./history.js";
import { registerDashboardCommand } from "./dashboard.js";
import { initConfig } from "../config.js";
import { runSubprocess } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("contribot")
    .description("Auto-contribute to GitHub open-source repos using Claude Code")
    .version("0.1.0");

  // config commands
  const config = program.command("config").description("Manage configuration");

  config
    .command("init")
    .description("Create default contribot.toml")
    .action(() => {
      console.log(initConfig());
    });

  config
    .command("check")
    .description("Validate config and prerequisites")
    .action(async () => {
      await checkPrerequisites();
    });

  registerRepoCommands(program);
  registerRunCommand(program);
  registerStatusCommand(program);
  registerHistoryCommand(program);
  registerDashboardCommand(program);

  return program;
}

async function checkPrerequisites() {
  const checks: Array<{ name: string; cmd: string; args: string[] }> = [
    { name: "git", cmd: "git", args: ["--version"] },
    { name: "gh CLI", cmd: "gh", args: ["--version"] },
    { name: "gh auth", cmd: "gh", args: ["auth", "status"] },
    { name: "claude CLI", cmd: "claude", args: ["--version"] },
  ];

  let allOk = true;

  for (const check of checks) {
    try {
      const result = await runSubprocess(check.cmd, check.args);
      if (result.exitCode === 0) {
        const version = result.stdout.trim().split("\n")[0];
        console.log(`  ✓ ${check.name}: ${version}`);
      } else {
        console.log(`  ✗ ${check.name}: failed (exit ${result.exitCode})`);
        if (result.stderr) console.log(`    ${result.stderr.trim()}`);
        allOk = false;
      }
    } catch {
      console.log(`  ✗ ${check.name}: not found`);
      allOk = false;
    }
  }

  // Check config file
  try {
    const { loadConfig } = await import("../config.js");
    loadConfig();
    console.log("  ✓ contribot.toml: valid");
  } catch (err: any) {
    console.log(`  ✗ contribot.toml: ${err.message}`);
    allOk = false;
  }

  console.log();
  if (allOk) {
    console.log("All checks passed! Ready to run.");
  } else {
    console.log("Some checks failed. Fix them before running contribot.");
    process.exitCode = 1;
  }
}
