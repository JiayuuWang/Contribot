import { type FastifyInstance } from "fastify";
import { type ContribotConfig } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, contributions, scans, taskQueue } from "../db/schema.js";
import { desc, eq, sql } from "drizzle-orm";
import { layoutTemplate } from "./templates/layout.js";
import { overviewTemplate } from "./templates/overview.js";
import { repoDetailTemplate } from "./templates/repo-detail.js";
import { historyTemplate } from "./templates/history.js";
import { logsTemplate, formatLogEntry } from "./templates/logs.js";
import { activityLog } from "../utils/activity-log.js";

export function registerRoutes(app: FastifyInstance, config: ContribotConfig) {
  const getDbInstance = () => getDb(config.general.db_path);

  // Inject repo links into sidebar dynamically
  async function renderPage(title: string, content: string, activePage: string) {
    const db = getDbInstance();
    const allRepos = await db.select().from(repos);

    // Build sidebar with repo links
    let html = layoutTemplate(title, content, activePage);

    // Inject repo links before sidebar-footer
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
    const activeTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "in_progress"));
    const pendingTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "pending"));
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
        startedAt: contributions.startedAt,
      })
      .from(contributions)
      .innerJoin(repos, eq(contributions.repoId, repos.id))
      .orderBy(desc(contributions.createdAt))
      .limit(10);

    const content = overviewTemplate({
      repos: allRepos,
      activeTasks: activeTasks.length,
      pendingTasks: pendingTasks.length,
      totalContributions: totalContribs[0]?.count ?? 0,
      successfulPRs: successPRs[0]?.count ?? 0,
      recentContributions: recentContribs,
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
      .limit(30);

    const repoScans = await db
      .select()
      .from(scans)
      .where(eq(scans.repoId, repo[0].id))
      .orderBy(desc(scans.startedAt))
      .limit(15);

    const content = repoDetailTemplate({
      repo: repo[0],
      contributions: repoContribs,
      scans: repoScans,
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
    const recentLogs = activityLog.getRecent(100);
    const content = logsTemplate(recentLogs);
    const html = await renderPage("Live Logs - Contribot", content, "logs");
    reply.type("text/html").send(html);
  });

  // === SSE endpoint for live logs ===

  app.get("/api/logs/stream", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const onEntry = (entry: any) => {
      const html = formatLogEntry(entry);
      reply.raw.write(`event: log\ndata: ${html.replace(/\n/g, "")}\n\n`);
    };

    activityLog.on("entry", onEntry);

    // Send initial keepalive
    reply.raw.write(": connected\n\n");

    // Heartbeat every 15s
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    req.raw.on("close", () => {
      activityLog.off("entry", onEntry);
      clearInterval(heartbeat);
    });
  });

  // === API Routes ===

  app.get("/api/status", async () => {
    const db = getDbInstance();
    const allRepos = await db.select().from(repos);
    const activeTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "in_progress"));
    const pendingTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "pending"));

    return {
      repos: allRepos.length,
      enabledRepos: allRepos.filter((r) => r.enabled).length,
      activeTasks: activeTasks.length,
      pendingTasks: pendingTasks.length,
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
    return activityLog.getRecent(50, afterId);
  });

  // === Partials for htmx polling ===

  app.get("/partials/stats", async (_, reply) => {
    const db = getDbInstance();
    const activeTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "in_progress"));
    const pendingTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "pending"));
    const totalContribs = await db.select({ count: sql<number>`count(*)` }).from(contributions);
    const successPRs = await db
      .select({ count: sql<number>`count(*)` })
      .from(contributions)
      .where(sql`${contributions.status} IN ('pr_created', 'merged')`);

    reply.type("text/html").send(`
      <div class="stat-card">
        <div class="stat-label">Active Tasks</div>
        <div class="stat-value">${activeTasks.length}</div>
        <div class="stat-sub">Currently running</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Tasks</div>
        <div class="stat-value">${pendingTasks.length}</div>
        <div class="stat-sub">In queue</div>
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
    `);
  });

  app.get("/partials/clock", async (_, reply) => {
    reply.type("text/html").send(new Date().toLocaleTimeString());
  });
}
