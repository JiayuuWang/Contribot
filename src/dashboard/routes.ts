import { type FastifyInstance } from "fastify";
import { type ContribotConfig } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, contributions, scans, activityLogs, repoStatus, claudeInstances, claudeOutput } from "../db/schema.js";
import { desc, eq, sql, and, gte, gt } from "drizzle-orm";
import { layoutTemplate } from "./templates/layout.js";
import { overviewTemplate } from "./templates/overview.js";
import { repoDetailTemplate } from "./templates/repo-detail.js";
import { historyTemplate } from "./templates/history.js";
import { logsTemplate, formatLogEntry } from "./templates/logs.js";
import { activityLog } from "../utils/activity-log.js";
import type { LogEntry } from "../utils/activity-log.js";

export function registerRoutes(app: FastifyInstance, config: ContribotConfig) {
  const getDbInstance = () => getDb(config.general.db_path);

  // Read recent logs from DB (cross-process safe)
  async function getLogsFromDb(limit = 200, afterId = 0): Promise<LogEntry[]> {
    const db = getDbInstance();
    const rows = afterId > 0
      ? await db.select().from(activityLogs).where(gt(activityLogs.id, afterId)).orderBy(activityLogs.id).limit(limit)
      : await db.select().from(activityLogs).orderBy(desc(activityLogs.id)).limit(limit);

    const entries = rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level as LogEntry["level"],
      source: r.source,
      repo: r.repo ?? undefined,
      message: r.message,
    }));

    // If afterId query, keep ascending order; otherwise reverse to get oldest-first
    return afterId > 0 ? entries : entries.reverse();
  }

  async function renderPage(title: string, content: string, activePage: string) {
    const db = getDbInstance();
    const allRepos = await db.select().from(repos);

    let html = layoutTemplate(title, content, activePage);

    const repoLinks = allRepos
      .map(
        (r) =>
          `<a href="/repo/${r.fullName}" class="${activePage === `repo:${r.fullName}` ? "active" : ""}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
            ${r.name}
          </a>`
      )
      .join("\n      ");

    html = html.replace(
      '<div class="sidebar-section">Repositories</div>',
      `<div class="sidebar-section">Repositories</div>\n      ${repoLinks}`
    );

    return html;
  }

  // === Pages ===

  app.get("/", async (_, reply) => {
    const db = getDbInstance();
    const allRepos = await db.select().from(repos);
    const totalContribs = await db.select({ count: sql<number>`count(*)` }).from(contributions);
    const successPRs = await db
      .select({ count: sql<number>`count(*)` })
      .from(contributions)
      .where(sql`${contributions.status} IN ('pr_created', 'merged')`);

    const recentContribs = await db
      .select({
        id: contributions.id,
        repoId: contributions.repoId,
        repoName: repos.fullName,
        type: contributions.type,
        status: contributions.status,
        title: contributions.title,
        prUrl: contributions.prUrl,
        claudeCostUsd: contributions.claudeCostUsd,
        startedAt: contributions.startedAt,
        completedAt: contributions.completedAt,
      })
      .from(contributions)
      .innerJoin(repos, eq(contributions.repoId, repos.id))
      .orderBy(desc(contributions.createdAt))
      .limit(10);

    // Today's PRs per repo
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPRs = await db
      .select({ repoId: contributions.repoId, count: sql<number>`count(*)` })
      .from(contributions)
      .where(
        and(
          sql`${contributions.status} IN ('pr_created', 'merged')`,
          gte(contributions.startedAt, todayStart.toISOString())
        )
      )
      .groupBy(contributions.repoId);
    const todayPRMap = new Map(todayPRs.map((r) => [r.repoId, r.count]));

    // Repo status from DB
    const repoStatuses = await db.select().from(repoStatus);
    const repoStatusMap = new Map(repoStatuses.map((s) => [s.repoFullName, s]));

    // Active instances from DB (cross-process safe)
    const activeInstancesDb = await db.select().from(claudeInstances).where(sql`${claudeInstances.endedAt} IS NULL`);
    const activeCount = repoStatuses.filter((s) => s.phase !== "idle").length;

    const content = overviewTemplate({
      repos: allRepos,
      totalContributions: totalContribs[0]?.count ?? 0,
      successfulPRs: successPRs[0]?.count ?? 0,
      recentContributions: recentContribs,
      activeInstances: activeInstancesDb,
      todayPRMap,
      repoStatusMap,
      activeCount,
    });

    const html = await renderPage("Contribot Dashboard", content, "overview");
    reply.type("text/html").send(html);
  });

  app.get("/repo/:owner/:name", async (req, reply) => {
    const { owner, name } = req.params as { owner: string; name: string };
    const fullName = `${owner}/${name}`;
    const db = getDbInstance();

    const repo = await db.select().from(repos).where(eq(repos.fullName, fullName)).limit(1);
    if (repo.length === 0) {
      reply.code(404).send("Repo not found");
      return;
    }

    const repoContribs = await db
      .select()
      .from(contributions)
      .where(eq(contributions.repoId, repo[0].id))
      .orderBy(desc(contributions.createdAt))
      .limit(50);

    const repoScans = await db
      .select()
      .from(scans)
      .where(eq(scans.repoId, repo[0].id))
      .orderBy(desc(scans.startedAt))
      .limit(15);

    const claudeHistory = await db.select().from(claudeInstances)
      .where(eq(claudeInstances.repo, fullName))
      .orderBy(desc(claudeInstances.startedAt))
      .limit(50);
    const status = await db.select().from(repoStatus).where(eq(repoStatus.repoFullName, fullName)).limit(1);

    const content = repoDetailTemplate({
      repo: repo[0],
      contributions: repoContribs,
      scans: repoScans,
      claudeHistory,
      currentStatus: status[0] ?? null,
    });

    const html = await renderPage(`${fullName} - Contribot`, content, `repo:${fullName}`);
    reply.type("text/html").send(html);
  });

  app.get("/history", async (req, reply) => {
    const db = getDbInstance();
    const page = parseInt((req.query as any).page ?? "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const allContribs = await db
      .select({
        id: contributions.id,
        repoName: repos.fullName,
        type: contributions.type,
        status: contributions.status,
        title: contributions.title,
        prUrl: contributions.prUrl,
        claudeCostUsd: contributions.claudeCostUsd,
        startedAt: contributions.startedAt,
        completedAt: contributions.completedAt,
        errorMessage: contributions.errorMessage,
      })
      .from(contributions)
      .innerJoin(repos, eq(contributions.repoId, repos.id))
      .orderBy(desc(contributions.createdAt))
      .limit(limit)
      .offset(offset);

    const content = historyTemplate({ contributions: allContribs, page });
    const html = await renderPage("History - Contribot", content, "history");
    reply.type("text/html").send(html);
  });

  app.get("/logs", async (_, reply) => {
    const recentLogs = await getLogsFromDb(200);
    const lastId = recentLogs.length > 0 ? recentLogs[recentLogs.length - 1].id : 0;
    const content = logsTemplate(recentLogs, lastId);
    const html = await renderPage("Live Logs - Contribot", content, "logs");
    reply.type("text/html").send(html);
  });

  // === SSE endpoint — polls DB for new log rows ===
  app.get("/api/logs/stream", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    reply.raw.write(": connected\n\n");

    // Start from the latest id in DB
    const db = getDbInstance();
    const latest = await db.select({ id: activityLogs.id }).from(activityLogs).orderBy(desc(activityLogs.id)).limit(1);
    let lastId = latest[0]?.id ?? 0;

    // Also listen to in-process events (same-process case: pnpm dev run --dashboard)
    const onEntry = (entry: LogEntry) => {
      const html = formatLogEntry(entry);
      const data = html.replace(/\r?\n/g, "");
      reply.raw.write(`event: log\ndata: ${data}\n\n`);
      if (entry.id > lastId) lastId = entry.id;
    };
    activityLog.on("entry", onEntry);

    // Poll DB every 2s for new rows (handles cross-process case)
    const pollTimer = setInterval(async () => {
      try {
        const newRows = await db
          .select()
          .from(activityLogs)
          .where(gt(activityLogs.id, lastId))
          .orderBy(activityLogs.id)
          .limit(50);

        for (const row of newRows) {
          // Skip if already sent via in-process event
          if (row.id <= lastId) continue;
          lastId = row.id;
          const entry: LogEntry = {
            id: row.id,
            timestamp: row.timestamp,
            level: row.level as LogEntry["level"],
            source: row.source,
            repo: row.repo ?? undefined,
            message: row.message,
          };
          const html = formatLogEntry(entry);
          const data = html.replace(/\r?\n/g, "");
          reply.raw.write(`event: log\ndata: ${data}\n\n`);
        }
      } catch { /* DB may not be ready */ }
    }, 2000);

    // Heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    req.raw.on("close", () => {
      activityLog.off("entry", onEntry);
      clearInterval(pollTimer);
      clearInterval(heartbeat);
    });
  });

  // === API Routes ===

  app.get("/api/status", async () => {
    const db = getDbInstance();
    const allRepos = await db.select().from(repos);
    const repoStatuses = await db.select().from(repoStatus);
    const activeRepos = repoStatuses.filter((s) => s.phase !== "idle");
    const totalContribs = await db.select({ count: sql<number>`count(*)` }).from(contributions);
    const successPRs = await db
      .select({ count: sql<number>`count(*)` })
      .from(contributions)
      .where(sql`${contributions.status} IN ('pr_created', 'merged')`);
    const activeInstancesDb = await db.select({ count: sql<number>`count(*)` })
      .from(claudeInstances)
      .where(sql`${claudeInstances.endedAt} IS NULL`);

    return {
      repos: allRepos.length,
      enabledRepos: allRepos.filter((r) => r.enabled).length,
      activeTasks: activeRepos.length,
      pendingTasks: 0,
      totalContributions: totalContribs[0]?.count ?? 0,
      successfulPRs: successPRs[0]?.count ?? 0,
      activeInstances: activeInstancesDb[0]?.count ?? 0,
    };
  });

  app.get("/api/repos", async () => {
    const db = getDbInstance();
    return db.select().from(repos);
  });

  app.get("/api/contributions", async (req) => {
    const db = getDbInstance();
    const limit = parseInt((req.query as any).limit ?? "50", 10);
    return db
      .select({
        id: contributions.id,
        repoName: repos.fullName,
        type: contributions.type,
        status: contributions.status,
        title: contributions.title,
        prUrl: contributions.prUrl,
        claudeCostUsd: contributions.claudeCostUsd,
        startedAt: contributions.startedAt,
        completedAt: contributions.completedAt,
      })
      .from(contributions)
      .innerJoin(repos, eq(contributions.repoId, repos.id))
      .orderBy(desc(contributions.createdAt))
      .limit(limit);
  });

  app.get("/api/logs", async (req) => {
    const afterId = parseInt((req.query as any).after ?? "0", 10);
    return getLogsFromDb(50, afterId);
  });

  app.get("/api/claude/instances", async () => {
    const db = getDbInstance();
    // Cross-process: read active instances from DB (no endedAt = still running)
    const dbActive = await db.select().from(claudeInstances).where(sql`${claudeInstances.endedAt} IS NULL`);
    // Recent history: last 30 completed instances
    const dbHistory = await db.select().from(claudeInstances)
      .where(sql`${claudeInstances.endedAt} IS NOT NULL`)
      .orderBy(desc(claudeInstances.endedAt))
      .limit(30);

    return {
      active: dbActive,
      dbActive: dbActive,
      history: dbHistory,
    };
  });

  app.get("/api/repo-status", async () => {
    const db = getDbInstance();
    return db.select().from(repoStatus);
  });

  // Per-instance Claude output — for split-screen dashboard view
  app.get("/api/claude/output/:instanceId", async (req) => {
    const { instanceId } = req.params as { instanceId: string };
    const afterId = parseInt((req.query as any).after ?? "0", 10);
    const db = getDbInstance();

    const rows = afterId > 0
      ? await db.select().from(claudeOutput)
          .where(and(eq(claudeOutput.instanceId, instanceId), gt(claudeOutput.id, afterId)))
          .orderBy(claudeOutput.id)
          .limit(200)
      : await db.select().from(claudeOutput)
          .where(eq(claudeOutput.instanceId, instanceId))
          .orderBy(claudeOutput.id)
          .limit(500);

    return rows;
  });

  // === Partials for htmx polling ===

  app.get("/partials/stats", async (_, reply) => {
    const db = getDbInstance();
    const repoStatuses = await db.select().from(repoStatus);
    const activeRepos = repoStatuses.filter((s) => s.phase !== "idle");
    const totalContribs = await db.select({ count: sql<number>`count(*)` }).from(contributions);
    const successPRs = await db
      .select({ count: sql<number>`count(*)` })
      .from(contributions)
      .where(sql`${contributions.status} IN ('pr_created', 'merged')`);
    // Use DB for cross-process active instances
    const activeInstancesDb = await db.select({ count: sql<number>`count(*)` })
      .from(claudeInstances)
      .where(sql`${claudeInstances.endedAt} IS NULL`);
    const activeInstanceCount = activeInstancesDb[0]?.count ?? 0;

    reply.type("text/html").send(`
      <div class="stat-card">
        <div class="stat-label">Active Repos</div>
        <div class="stat-value" style="color:${activeRepos.length > 0 ? "var(--accent)" : "inherit"}">${activeRepos.length}</div>
        <div class="stat-sub">Currently working</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Contributions</div>
        <div class="stat-value">${totalContribs[0]?.count ?? 0}</div>
        <div class="stat-sub">All time</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Successful PRs</div>
        <div class="stat-value">${successPRs[0]?.count ?? 0}</div>
        <div class="stat-sub">Created or merged</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Claude Instances</div>
        <div class="stat-value" style="color:${activeInstanceCount > 0 ? "var(--accent)" : "inherit"}">${activeInstanceCount}</div>
        <div class="stat-sub">Running now</div>
      </div>
    `);
  });

  app.get("/partials/clock", async (_, reply) => {
    reply.type("text/html").send(new Date().toLocaleTimeString());
  });

  app.get("/partials/repo-status", async (_, reply) => {
    const db = getDbInstance();
    const statuses = await db.select().from(repoStatus);
    const active = statuses.filter((s) => s.phase !== "idle");

    if (active.length === 0) {
      reply.type("text/html").send(`<div class="empty-state" style="padding:16px"><p>Orchestrator idle — no active work</p></div>`);
      return;
    }

    const rows = active.map((s) => {
      const elapsed = Math.round((Date.now() - new Date(s.updatedAt).getTime()) / 1000);
      const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
      return `<div class="instance-row">
        <span class="pulse"></span>
        <span class="instance-repo">${escapeHtml(s.repoFullName)}</span>
        <span class="instance-phase">${escapeHtml(s.phase)}</span>
        <span class="instance-prompt">${escapeHtml(s.currentTask ?? "")}</span>
        <span class="instance-elapsed">${elapsedStr} ago</span>
      </div>`;
    }).join("");

    reply.type("text/html").send(rows);
  });

  app.get("/partials/recent-contribs", async (_, reply) => {
    const db = getDbInstance();
    const recentContribs = await db
      .select({
        id: contributions.id,
        repoName: repos.fullName,
        type: contributions.type,
        status: contributions.status,
        title: contributions.title,
        prUrl: contributions.prUrl,
        claudeCostUsd: contributions.claudeCostUsd,
        startedAt: contributions.startedAt,
        completedAt: contributions.completedAt,
      })
      .from(contributions)
      .innerJoin(repos, eq(contributions.repoId, repos.id))
      .orderBy(desc(contributions.createdAt))
      .limit(10);

    const rows = recentContribs.map((c) => contribRow(c)).join("");
    reply.type("text/html").send(
      rows || `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:24px">No contributions yet</td></tr>`
    );
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function contribRow(c: any): string {
  const statusMap: Record<string, string> = {
    pr_created: "badge-success", merged: "badge-success", completed: "badge-success",
    failed: "badge-danger", interrupted: "badge-danger",
    coding: "badge-info", scanning: "badge-info", pushing: "badge-info", in_progress: "badge-info",
    pending: "badge-warning", planning: "badge-warning",
  };
  const badge = `<span class="badge ${statusMap[c.status] ?? "badge-neutral"}">${c.status}</span>`;
  const cost = c.claudeCostUsd != null ? `<span style="color:var(--text-tertiary);font-size:11px">$${Number(c.claudeCostUsd).toFixed(4)}</span>` : "";
  const duration = c.startedAt && c.completedAt
    ? `<span style="color:var(--text-tertiary);font-size:11px">${Math.round((new Date(c.completedAt).getTime() - new Date(c.startedAt).getTime()) / 1000)}s</span>`
    : "";
  return `<tr>
    <td><a href="/repo/${c.repoName}">${escapeHtml(c.repoName)}</a></td>
    <td><span class="badge badge-neutral">${c.type}</span></td>
    <td>${badge}</td>
    <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.title ?? "-")}</td>
    <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank" class="btn btn-sm">View PR</a>` : "-"}</td>
    <td>${cost} ${duration}</td>
  </tr>`;
}
