import { runGh } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  state: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export async function listIssues(
  repo: string,
  labels: string[],
  limit = 20
): Promise<Issue[]> {
  const args = [
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,title,body,labels,state,comments,createdAt,updatedAt,url",
  ];

  // Only filter by label when labels are explicitly specified
  // Empty array = fetch all open issues without label restriction
  for (const label of labels) {
    args.push("--label", label);
  }

  const result = await runGh(args);

  if (result.exitCode !== 0) {
    logger.error({ repo, stderr: result.stderr }, "Failed to list issues");
    return [];
  }

  return JSON.parse(result.stdout || "[]");
}

export async function getIssue(repo: string, number: number): Promise<Issue> {
  const result = await runGh([
    "issue",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "number,title,body,labels,state,comments,createdAt,updatedAt,url",
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to get issue #${number}: ${result.stderr}`);
  }

  return JSON.parse(result.stdout);
}

export async function createIssue(
  repo: string,
  title: string,
  body: string,
  labels: string[] = []
): Promise<{ number: number; url: string }> {
  const args = ["issue", "create", "--repo", repo, "--title", title, "--body", body];

  for (const label of labels) {
    args.push("--label", label);
  }

  const result = await runGh(args);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create issue: ${result.stderr}`);
  }

  // gh issue create outputs the URL
  const url = result.stdout.trim();
  const numberMatch = url.match(/\/issues\/(\d+)/);
  return {
    number: numberMatch ? parseInt(numberMatch[1], 10) : 0,
    url,
  };
}
