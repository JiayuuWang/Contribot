import { runGh } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

export async function ensureForked(repoFullName: string): Promise<void> {
  logger.info({ repo: repoFullName }, "Ensuring fork exists");
  const result = await runGh(["repo", "fork", repoFullName, "--clone=false"]);

  if (result.exitCode !== 0) {
    // gh repo fork returns non-zero if fork already exists, that's ok
    if (result.stderr.includes("already exists")) {
      logger.debug({ repo: repoFullName }, "Fork already exists");
      return;
    }
    throw new Error(`Failed to fork ${repoFullName}: ${result.stderr}`);
  }
}

export async function cloneRepo(
  forkUrl: string,
  localPath: string,
  upstreamUrl: string
): Promise<void> {
  const { runGit } = await import("../utils/subprocess.js");

  logger.info({ forkUrl, localPath }, "Cloning repo");
  const result = await runGit(["clone", forkUrl, localPath]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to clone: ${result.stderr}`);
  }

  // Add upstream remote
  const upResult = await runGit(["remote", "add", "upstream", upstreamUrl], localPath);
  if (upResult.exitCode !== 0 && !upResult.stderr.includes("already exists")) {
    throw new Error(`Failed to add upstream: ${upResult.stderr}`);
  }

  // Fetch upstream
  await runGit(["fetch", "upstream"], localPath);
}
