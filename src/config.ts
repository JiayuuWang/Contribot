import { readFileSync, existsSync, writeFileSync, copyFileSync } from "fs";
import { resolve } from "path";
import TOML from "@iarna/toml";
import { z } from "zod";

const ContributionFocusEnum = z.enum([
  "bug-fixes",
  "documentation",
  "tests",
  "refactoring",
  "features",
  "issues",
]);

const RepoConfigSchema = z.object({
  name: z.string().regex(/^[^/]+\/[^/]+$/, "Must be owner/repo format"),
  focus: z.array(ContributionFocusEnum).default(["bug-fixes"]),
  reasons: z.string().default(""),
  issue_labels: z.array(z.string()).default(["good first issue"]),
  max_prs_per_day: z.number().int().min(0).default(2),
  enabled: z.boolean().default(true),
});

const ConfigSchema = z.object({
  general: z
    .object({
      workspaces_dir: z.string().default("./data/workspaces"),
      db_path: z.string().default("./data/contribot.db"),
      log_dir: z.string().default("./data/logs"),
      scan_interval_minutes: z.number().int().min(1).default(60),
      max_concurrent_repos: z.number().int().min(1).default(3),
      claude_model: z.string().default("sonnet"),
      max_budget_per_task_usd: z.number().min(0).default(0.5),
      dashboard_port: z.number().int().default(3847),
    })
    .default({}),
  github: z
    .object({
      username: z.string().default(""),
    })
    .default({}),
  repos: z.array(RepoConfigSchema).default([]),
});

export type ContribotConfig = z.infer<typeof ConfigSchema>;
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type ContributionFocus = z.infer<typeof ContributionFocusEnum>;

const CONFIG_FILENAME = "contribot.toml";

function findConfigPath(): string {
  const localPath = resolve(process.cwd(), CONFIG_FILENAME);
  if (existsSync(localPath)) return localPath;
  return localPath; // default to CWD even if not found yet
}

export function loadConfig(): ContribotConfig {
  const configPath = findConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\nRun "contribot config init" to create one.`
    );
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = TOML.parse(raw);
  return ConfigSchema.parse(parsed);
}

export function initConfig(): string {
  const configPath = resolve(process.cwd(), CONFIG_FILENAME);
  const examplePath = resolve(process.cwd(), `${CONFIG_FILENAME}.example`);

  if (existsSync(configPath)) {
    return `Config already exists: ${configPath}`;
  }

  if (existsSync(examplePath)) {
    copyFileSync(examplePath, configPath);
  } else {
    const defaultConfig = `# Contribot Configuration

[general]
workspaces_dir = "./data/workspaces"
db_path = "./data/contribot.db"
log_dir = "./data/logs"
scan_interval_minutes = 60
max_concurrent_repos = 3
claude_model = "sonnet"
max_budget_per_task_usd = 0.50
dashboard_port = 3847

[github]
username = ""

# Add repos like this:
# [[repos]]
# name = "owner/repo"
# focus = ["bug-fixes", "documentation"]
# reasons = "Why you want to contribute"
# issue_labels = ["good first issue", "help wanted"]
# max_prs_per_day = 2
# enabled = true
`;
    writeFileSync(configPath, defaultConfig, "utf-8");
  }

  return `Config created: ${configPath}`;
}

export function addRepoToConfig(repo: RepoConfig) {
  const configPath = findConfigPath();
  const raw = readFileSync(configPath, "utf-8");
  const parsed = TOML.parse(raw) as any;

  if (!parsed.repos) parsed.repos = [];
  const existing = parsed.repos.find((r: any) => r.name === repo.name);
  if (existing) {
    throw new Error(`Repo ${repo.name} already exists in config`);
  }

  parsed.repos.push({
    name: repo.name,
    focus: repo.focus,
    reasons: repo.reasons,
    issue_labels: repo.issue_labels,
    max_prs_per_day: repo.max_prs_per_day,
    enabled: repo.enabled,
  });

  writeFileSync(configPath, TOML.stringify(parsed as any), "utf-8");
}

export function removeRepoFromConfig(repoName: string) {
  const configPath = findConfigPath();
  const raw = readFileSync(configPath, "utf-8");
  const parsed = TOML.parse(raw) as any;

  if (!parsed.repos) parsed.repos = [];
  const idx = parsed.repos.findIndex((r: any) => r.name === repoName);
  if (idx === -1) {
    throw new Error(`Repo ${repoName} not found in config`);
  }

  parsed.repos.splice(idx, 1);
  writeFileSync(configPath, TOML.stringify(parsed as any), "utf-8");
}
