import { runGh } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

export interface PR {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  headRefName: string;
  createdAt: string;
}

export interface CreatePROptions {
  repo: string;
  head: string; // "username:branch"
  base?: string;
  title: string;
  body: string;
}

export async function createPR(opts: CreatePROptions): Promise<PR> {
  const args = [
    "pr",
    "create",
    "--repo",
    opts.repo,
    "--head",
    opts.head,
    "--base",
    opts.base ?? "main",
    "--title",
    opts.title,
    "--body",
    opts.body,
  ];

  const result = await runGh(args);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create PR: ${result.stderr}`);
  }

  // gh pr create outputs the PR URL
  const url = result.stdout.trim();
  const numberMatch = url.match(/\/pull\/(\d+)/);
  const prNumber = numberMatch ? parseInt(numberMatch[1], 10) : 0;

  logger.info({ repo: opts.repo, pr: prNumber, url }, "Created PR");

  return {
    number: prNumber,
    title: opts.title,
    body: opts.body,
    state: "open",
    url,
    headRefName: opts.head.split(":")[1] ?? opts.head,
    createdAt: new Date().toISOString(),
  };
}

export async function listMyPRs(repo: string): Promise<PR[]> {
  const result = await runGh([
    "pr",
    "list",
    "--repo",
    repo,
    "--author",
    "@me",
    "--json",
    "number,title,body,state,url,headRefName,createdAt",
    "--limit",
    "50",
  ]);

  if (result.exitCode !== 0) {
    logger.error({ repo, stderr: result.stderr }, "Failed to list PRs");
    return [];
  }

  return JSON.parse(result.stdout || "[]");
}

export async function getPRStatus(
  repo: string,
  number: number
): Promise<{ state: string; reviewDecision: string }> {
  const result = await runGh([
    "pr",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "state,reviewDecision",
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get PR #${number}: ${result.stderr}`);
  }

  return JSON.parse(result.stdout);
}
