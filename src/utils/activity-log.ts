import { EventEmitter } from "events";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  repo?: string;
  message: string;
}

class ActivityLog extends EventEmitter {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private maxEntries = 500;

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

    this.emit("entry", entry);
  }

  getRecent(limit = 50, afterId = 0): LogEntry[] {
    const filtered = afterId > 0
      ? this.entries.filter((e) => e.id > afterId)
      : this.entries;
    return filtered.slice(-limit);
  }

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
