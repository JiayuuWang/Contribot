import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const repos = sqliteTable("repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull().unique(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  focus: text("focus").notNull(), // JSON array
  reasons: text("reasons").default(""),
  issueLabels: text("issue_labels").notNull(), // JSON array
  maxPrsPerDay: integer("max_prs_per_day").notNull().default(2),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  localPath: text("local_path"),
  forkCreated: integer("fork_created", { mode: "boolean" }).default(false),
  lastScannedAt: text("last_scanned_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const contributions = sqliteTable("contributions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repos.id),
  type: text("type").notNull(), // "pr" | "issue"
  status: text("status").notNull(), // scanning|planning|coding|pushing|pr_created|merged|closed|failed|interrupted
  issueNumber: integer("issue_number"),
  prNumber: integer("pr_number"),
  prUrl: text("pr_url"),
  branchName: text("branch_name"),
  title: text("title"),
  description: text("description"),
  diffSummary: text("diff_summary"),
  claudeCostUsd: real("claude_cost_usd"),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const scans = sqliteTable("scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repos.id),
  status: text("status").notNull(), // running|completed|failed
  issuesFound: integer("issues_found").default(0),
  opportunitiesFound: integer("opportunities_found").default(0),
  result: text("result"), // JSON
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const taskQueue = sqliteTable("task_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repos.id),
  type: text("type").notNull(), // scan|contribute_issue|contribute_opportunity|create_issue
  status: text("status").notNull(), // pending|in_progress|completed|failed|interrupted
  priority: integer("priority").notNull().default(0),
  payload: text("payload").notNull(), // JSON
  result: text("result"), // JSON
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(), // info|warn|error|debug
  source: text("source").notNull(),
  repo: text("repo"),
  message: text("message").notNull(),
});

export const repoStatus = sqliteTable("repo_status", {
  repoFullName: text("repo_full_name").primaryKey(),
  phase: text("phase").notNull().default("idle"), // idle|scanning|planning|contributing|pr-description|issue-creating
  currentTask: text("current_task"),               // human-readable description
  claudePhase: text("claude_phase"),               // phase passed to invokeClaude
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
