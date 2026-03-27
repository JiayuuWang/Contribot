import { runGh } from "../utils/subprocess.js";

export async function ghApi<T>(endpoint: string, method = "GET", body?: object): Promise<T> {
  const args = ["api", endpoint, "--method", method];

  if (body) {
    args.push("--input", "-");
  }

  const result = await runGh(args);

  if (result.exitCode !== 0) {
    throw new Error(`gh api ${method} ${endpoint} failed: ${result.stderr}`);
  }

  return JSON.parse(result.stdout);
}

export async function getAuthenticatedUser(): Promise<string> {
  const result = await runGh(["auth", "status", "--active"]);
  const match = result.stdout.match(/Logged in to github\.com account (\S+)/);
  if (match) return match[1];

  // Alternative parsing
  const result2 = await runGh(["api", "user", "--jq", ".login"]);
  return result2.stdout.trim();
}
