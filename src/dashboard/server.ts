import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { type ContribotConfig } from "../config.js";
import { registerRoutes } from "./routes.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function startDashboard(config: ContribotConfig): Promise<void> {
  const app = Fastify({ logger: false });

  // Serve static files
  await app.register(fastifyStatic, {
    root: resolve(__dirname, "public"),
    prefix: "/public/",
  });

  // Register routes
  registerRoutes(app, config);

  const port = config.general.dashboard_port;
  await app.listen({ port, host: "0.0.0.0" });
  logger.info(`Dashboard started at http://localhost:${port}`);
}
