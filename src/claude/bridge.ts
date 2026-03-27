import { spawn } from "child_process";
import { logger } from "../utils/logger.js";
import { activityLog } from "../utils/activity-log.js";

export interface ClaudeInvocation {
  prompt: string;
  cwd: string;
  systemPrompt?: string;
  outputFormat?: "json" | "text";
  jsonSchema?: object;
  maxBudgetUsd?: number;
  allowedTools?: string[];
  model?: string;
  timeout?: number;
  appendProvider?: string;
  repo?: string;
}

export interface ClaudeResult {
  success: boolean;
  output: string;
  parsed?: any;
  costUsd?: number;
  error?: string;
}

export async function invokeClaude(opts: ClaudeInvocation): Promise<ClaudeResult> {
  const args = ["--print"];

  if (opts.outputFormat === "json") {
    args.push("--output-format", "json");
  }

  if (opts.jsonSchema) {
    args.push("--output-format", "json");
  }

  if (opts.maxBudgetUsd !== undefined) {
    args.push("--max-turns", "50");
  }

  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push("--allowedTools", opts.allowedTools.join(","));
  }

  if (opts.systemPrompt) {
    args.push("--system-prompt", opts.systemPrompt);
  }

  if (opts.model) {
    args.push("--model", opts.model);
  }

  if (opts.appendProvider) {
    args.push("--append-system-prompt", opts.appendProvider);
  }

  args.push("--", opts.prompt);

  const repoLabel = opts.repo ?? "unknown";
  const promptPreview = opts.prompt.slice(0, 80).replace(/\n/g, " ");

  logger.info({ cwd: opts.cwd, model: opts.model }, "Invoking Claude");
  activityLog.info("claude", `Invoking Claude: ${promptPreview}...`, repoLabel);

  return new Promise((resolve) => {
    const fullCommand =
      process.platform === "win32"
        ? `claude ${args.map(escapeArg).join(" ")}`
        : "claude";
    const spawnArgs = process.platform === "win32" ? [] : args;

    const proc = spawn(fullCommand, spawnArgs, {
      cwd: opts.cwd,
      env: process.env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Stream output lines to activity log
      const lines = chunk.split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        activityLog.debug("claude:output", line.slice(0, 200), repoLabel);
      }
    });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      activityLog.warn("claude:stderr", chunk.slice(0, 200), repoLabel);
    });

    const timeout = opts.timeout ?? 600_000;
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      activityLog.error("claude", "Process timed out", repoLabel);
      resolve({ success: false, output: stdout, error: `Timed out after ${timeout}ms` });
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        activityLog.error("claude", `Exited with code ${code}`, repoLabel);
        resolve({
          success: false,
          output: stdout,
          error: stderr || `Exit code: ${code}`,
        });
        return;
      }

      activityLog.info("claude", "Completed successfully", repoLabel);

      let parsed: any = undefined;
      if (opts.outputFormat === "json" || opts.jsonSchema) {
        try {
          parsed = JSON.parse(stdout);
        } catch {
          logger.warn("Failed to parse Claude output as JSON");
        }
      }

      resolve({ success: true, output: stdout, parsed });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      activityLog.error("claude", `Spawn error: ${err.message}`, repoLabel);
      resolve({ success: false, output: "", error: err.message });
    });
  });
}

function escapeArg(arg: string): string {
  if (/[ "&|<>^]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}
