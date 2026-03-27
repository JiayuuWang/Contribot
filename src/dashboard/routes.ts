import { type FastifyInstance } from "fastify";
import { type ContribotConfig } from "../config.js";
import { getDb } from "../db/connection.js";
import { repos, contributions, scans, taskQueue } from "../db/schema.js";
import { desc, eq, sql } from "drizzle-orm";
import { layoutTemplate } from "./templates/layout.js";
import { overviewTemplate } from "./templates/overview.js";
import { repoDetailTemplate } from "./templates/repo-detail.js";
import { historyTemplate } from "./templates/history.js";

export function registerRoutes(app: FastifyInstance, config: ContribotConfig) {
  const getDbInstance = () => getDb(config.general.db_path);

  // === Pages ===

  app.get("/", async (_, reply) => {
    const db = getDbInstance();
    const allRepos = await db.select().from(repos);
    const activeTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "in_progress"));
    const pendingTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "pending"));
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

    const html = layoutTemplate(
      "Contribot Dashboard",
      overviewTemplate({
        repos: allRepos,
        activeTasks: activeTasks.length,
        pendingTasks: pendingTasks.length,
        recentContributions: recentContribs,
      })
    );

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
      .limit(20);

    const repoScans = await db
      .select()
      .from(scans)
      .where(eq(scans.repoId, repo[0].id))
      .orderBy(desc(scans.startedAt))
      .limit(10);

    const html = layoutTemplate(
      `${fullName} - Contribot`,
      repoDetailTemplate({
        repo: repo[0],
        contributions: repoContribs,
        scans: repoScans,
      })
    );

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

    const html = layoutTemplate(
      "History - Contribot",
      historyTemplate({ contributions: allContribs, page })
    );

    reply.type("text/html").send(html);
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

  // Partial for htmx polling
  app.get("/partials/status", async () => {
    const db = getDbInstance();
    const activeTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "in_progress"));
    const pendingTasks = await db.select().from(taskQueue).where(eq(taskQueue.status, "pending"));
    const totalContribs = await db.select({ count: sql<number>`count(*)` }).from(contributions);

    return `
      <div class="grid">
        <div class="card"><h3>${activeTasks.length}</h3><p>Active Tasks</p></div>
        <div class="card"><h3>${pendingTasks.length}</h3><p>Pending Tasks</p></div>
        <div class="card"><h3>${totalContribs[0]?.count ?? 0}</h3><p>Total Contributions</p></div>
      </div>
    `;
  });
}
