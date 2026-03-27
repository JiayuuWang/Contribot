import { runGit } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

export async function createBranch(cwd: string, branchName: string): Promise<void> {
  // Start from upstream/main (or upstream/master)
  const defaultBranch = await getDefaultBranch(cwd);

  await runGit(["fetch", "upstream"], cwd);
  const result = await runGit(
    ["checkout", "-b", branchName, `upstream/${defaultBranch}`],
    cwd
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create branch ${branchName}: ${result.stderr}`);
  }

  logger.info({ branch: branchName, cwd }, "Created branch");
}

export async function checkout(cwd: string, branch: string): Promise<void> {
  const result = await runGit(["checkout", branch], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to checkout ${branch}: ${result.stderr}`);
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return result.stdout.trim();
}

export async function getDefaultBranch(cwd: string): Promise<string> {
  // Try to detect the default branch of upstream
  const result = await runGit(
    ["symbolic-ref", "refs/remotes/upstream/HEAD", "--short"],
    cwd
  );

  if (result.exitCode === 0) {
    return result.stdout.trim().replace("upstream/", "");
  }

  // Fallback: check if main or master exists
  const branches = await runGit(["branch", "-r"], cwd);
  if (branches.stdout.includes("upstream/main")) return "main";
  if (branches.stdout.includes("upstream/master")) return "master";

  return "main"; // default assumption
}

export async function deleteBranch(cwd: string, branchName: string): Promise<void> {
  await runGit(["branch", "-D", branchName], cwd);
}
