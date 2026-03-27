import { runGit } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

export async function stageAll(cwd: string): Promise<void> {
  const result = await runGit(["add", "-A"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to stage changes: ${result.stderr}`);
  }
}

export async function commit(cwd: string, message: string): Promise<void> {
  const result = await runGit(["commit", "-m", message], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to commit: ${result.stderr}`);
  }
  logger.info({ cwd }, "Committed changes");
}

export async function push(cwd: string, branch: string): Promise<void> {
  const result = await runGit(["push", "origin", branch, "--force-with-lease"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to push: ${result.stderr}`);
  }
  logger.info({ branch, cwd }, "Pushed to origin");
}

export async function hasChanges(cwd: string): Promise<boolean> {
  const result = await runGit(["diff", "--stat"], cwd);
  const staged = await runGit(["diff", "--cached", "--stat"], cwd);
  return result.stdout.trim().length > 0 || staged.stdout.trim().length > 0;
}

export async function getDiffSummary(cwd: string): Promise<string> {
  const result = await runGit(["diff", "--cached", "--stat"], cwd);
  return result.stdout.trim();
}

export async function getDiff(cwd: string): Promise<string> {
  const result = await runGit(["diff", "--cached"], cwd);
  return result.stdout;
}
