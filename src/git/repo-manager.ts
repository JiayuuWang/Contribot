import { existsSync } from "fs";
import { resolve } from "path";
import { runGit } from "../utils/subprocess.js";
import { ensureForked, cloneRepo } from "./clone.js";
import { createBranch, getDefaultBranch } from "./branch.js";
import { stageAll, commit, push } from "./commit.js";
import { logger } from "../utils/logger.js";

export interface GitWorkspace {
  repoFullName: string;
  owner: string;
  name: string;
  localPath: string;
  username: string;
}

export async function setupWorkspace(
  repoFullName: string,
  workspacesDir: string,
  username: string
): Promise<GitWorkspace> {
  const [owner, name] = repoFullName.split("/");
  const localPath = resolve(workspacesDir, `${owner}__${name}`);
  const workspace: GitWorkspace = { repoFullName, owner, name, localPath, username };

  // 1. Ensure fork exists
  await ensureForked(repoFullName);

  // 2. Clone if not already cloned
  if (!existsSync(localPath)) {
    const forkUrl = `https://github.com/${username}/${name}.git`;
    const upstreamUrl = `https://github.com/${repoFullName}.git`;
    await cloneRepo(forkUrl, localPath, upstreamUrl);
  }

  // 3. Sync with upstream
  await syncWithUpstream(workspace);

  return workspace;
}

export async function syncWithUpstream(workspace: GitWorkspace): Promise<void> {
  const { localPath } = workspace;
  const defaultBranch = await getDefaultBranch(localPath);

  logger.info({ repo: workspace.repoFullName }, "Syncing with upstream");

  await runGit(["fetch", "upstream"], localPath);
  await runGit(["checkout", defaultBranch], localPath);
  await runGit(["reset", "--hard", `upstream/${defaultBranch}`], localPath);
  await runGit(["push", "origin", defaultBranch, "--force"], localPath);
}

export async function prepareContribution(
  workspace: GitWorkspace,
  branchName: string
): Promise<void> {
  await createBranch(workspace.localPath, branchName);
}

export async function commitAndPush(
  workspace: GitWorkspace,
  branchName: string,
  message: string
): Promise<void> {
  await stageAll(workspace.localPath);
  await commit(workspace.localPath, message);
  await push(workspace.localPath, branchName);
}
