import { EventEmitter } from "events";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  repo?: string;
  message: string;
}

export interface ClaudeInstance {
  id: string;
  repo: string;
  phase: string;
  prompt: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  costUsd?: number;
  success?: boolean;
  error?: string;
}

// DB writer — injected at startup so activity-log doesn't import db (avoids circular deps)
let _dbWriter: ((level: string, source: string, repo: string | undefined, message: string) => void) | null = null;
let _statusWriter: ((repo: string, phase: string, currentTask?: string, claudePhase?: string) => void) | null = null;
let _claudeInstanceWriter: ((action: "start" | "end", instance: ClaudeInstance) => void) | null = null;
let _claudeOutputWriter: ((instanceId: string, stream: "stdout" | "stderr", line: string) => void) | null = null;

export function initActivityLogDb(
  dbWriter: typeof _dbWriter,
  statusWriter: typeof _statusWriter,
  claudeInstanceWriter?: typeof _claudeInstanceWriter,
  claudeOutputWriter?: typeof _claudeOutputWriter,
) {
  _dbWriter = dbWriter;
  _statusWriter = statusWriter;
  _claudeInstanceWriter = claudeInstanceWriter ?? null;
  _claudeOutputWriter = claudeOutputWriter ?? null;
}

class ActivityLog extends EventEmitter {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private maxEntries = 1000;

  private claudeInstances: Map<string, ClaudeInstance> = new Map();
  private claudeHistory: ClaudeInstance[] = [];
  private maxClaudeHistory = 100;

  append(level: LogEntry["level"], source: string, message: string, repo?: string) {
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level,
      source,
      repo,
      message,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Persist to DB (fire-and-forget, never throw)
    if (_dbWriter) {
      try { _dbWriter(level, source, repo, message); } catch { /* ignore */ }
    }

    this.emit("entry", entry);
  }

  getRecent(limit = 50, afterId = 0): LogEntry[] {
    const filtered = afterId > 0
      ? this.entries.filter((e) => e.id > afterId)
      : this.entries;
    return filtered.slice(-limit);
  }

  // === Claude instance tracking ===

  claudeStart(instanceId: string, repo: string, phase: string, prompt: string) {
    const instance: ClaudeInstance = {
      id: instanceId,
      repo,
      phase,
      prompt: prompt.slice(0, 200),
      startedAt: new Date().toISOString(),
    };
    this.claudeInstances.set(instanceId, instance);
    this.emit("claude:start", instance);

    if (_statusWriter) {
      try { _statusWriter(repo, "running", phase, phase); } catch { /* ignore */ }
    }

    // Persist to DB
    if (_claudeInstanceWriter) {
      try { _claudeInstanceWriter("start", instance); } catch { /* ignore */ }
    }

    this.append("info", "claude:lifecycle", `[START] ${phase}`, repo);
  }

  claudeOutput(instanceId: string, stream: "stdout" | "stderr", line: string) {
    this.emit("claude:output", { instanceId, stream, line });

    // Persist to DB for cross-process dashboard
    if (_claudeOutputWriter) {
      try { _claudeOutputWriter(instanceId, stream, line); } catch { /* ignore */ }
    }
  }

  claudeEnd(instanceId: string, success: boolean, costUsd?: number, error?: string) {
    const instance = this.claudeInstances.get(instanceId);
    if (!instance) return;

    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(instance.startedAt).getTime();

    const completed: ClaudeInstance = {
      ...instance,
      endedAt,
      durationMs,
      costUsd,
      success,
      error,
    };

    this.claudeInstances.delete(instanceId);
    this.claudeHistory.unshift(completed);
    if (this.claudeHistory.length > this.maxClaudeHistory) {
      this.claudeHistory = this.claudeHistory.slice(0, this.maxClaudeHistory);
    }

    this.emit("claude:end", completed);

    // Persist to DB
    if (_claudeInstanceWriter) {
      try { _claudeInstanceWriter("end", completed); } catch { /* ignore */ }
    }

    const durS = (durationMs / 1000).toFixed(1);
    const costStr = costUsd !== undefined ? ` cost=$${costUsd.toFixed(4)}` : "";
    this.append(
      success ? "info" : "error",
      "claude:lifecycle",
      `[${success ? "DONE" : "FAIL"}] ${instance.phase} in ${durS}s${costStr}${error ? ` — ${error}` : ""}`,
      instance.repo
    );
  }

  getActiveInstances(): ClaudeInstance[] {
    return Array.from(this.claudeInstances.values());
  }

  getClaudeHistory(limit = 20): ClaudeInstance[] {
    return this.claudeHistory.slice(0, limit);
  }

  // === Convenience log methods ===

  info(source: string, message: string, repo?: string) {
    this.append("info", source, message, repo);
  }

  warn(source: string, message: string, repo?: string) {
    this.append("warn", source, message, repo);
  }

  error(source: string, message: string, repo?: string) {
    this.append("error", source, message, repo);
  }

  debug(source: string, message: string, repo?: string) {
    this.append("debug", source, message, repo);
  }
}

// Singleton
export const activityLog = new ActivityLog();
