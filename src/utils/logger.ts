import pino from "pino";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

let logDir = "./data/logs";

export function setLogDir(dir: string) {
  logDir = dir;
}

function ensureLogDir() {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
  },
});

export function createFileLogger(filename: string) {
  ensureLogDir();
  const dest = pino.destination(`${logDir}/${filename}`);
  return pino({ level: "debug" }, dest);
}
