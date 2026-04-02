import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
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
  phase?: string;
}

export interface ClaudeResult {
  success: boolean;
  output: string;
  parsed?: any;
  costUsd?: number;
  error?: string;
}

export async function invokeClaude(opts: ClaudeInvocation): Promise<ClaudeResult> {
  const instanceId = randomUUID();
  const phase = opts.phase ?? (opts.allowedTools?.includes("Edit") ? "contribute" : "scan");
  const repoLabel = opts.repo ?? "unknown";

  activityLog.claudeStart(instanceId, repoLabel, phase, opts.prompt);

  // Always use stream-json to get real-time output for the dashboard.
  // We parse the stream events and reconstruct the final result ourselves.
  // --verbose is required for stream-json with --print.
  const args = ["--print", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"];

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

  // Ensure cwd exists
  if (!existsSync(opts.cwd)) {
    mkdirSync(opts.cwd, { recursive: true });
  }

  // Prompt is piped via stdin to avoid Windows cmd.exe command-line length limits.
  const isWindows = process.platform === "win32";
  const command = isWindows ? `claude ${args.map(escapeArg).join(" ")}` : "claude";
  const spawnArgs = isWindows ? [] : args;

  const promptPreview = opts.prompt.slice(0, 80).replace(/\n/g, " ");
  logger.info({ cwd: opts.cwd, model: opts.model }, "Invoking Claude");
  activityLog.info("claude", `Invoking Claude: ${promptPreview}...`, repoLabel);

  // Build env: conditionally apply TLS 1.2 restriction
  const childEnv = { ...process.env };
  if (process.env.CONTRIBOT_TLS12 === "1") {
    childEnv.NODE_OPTIONS = "--tls-max-v1.2";
  }

  return new Promise((resolve) => {
    const proc = spawn(command, spawnArgs, {
      cwd: opts.cwd,
      env: childEnv,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write prompt to stdin and close it
    proc.stdin.write(opts.prompt);
    proc.stdin.end();

    let rawStdout = "";
    let stderr = "";
    let finalText = "";      // Accumulated assistant text
    let costUsd: number | undefined;
    let lineBuf = "";         // Buffer for incomplete JSON lines

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      rawStdout += chunk;
      lineBuf += chunk;

      // stream-json outputs one JSON object per line
      const lines = lineBuf.split("\n");
      // Keep the last element (may be incomplete)
      lineBuf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          const display = formatStreamEvent(event);

          if (display) {
            // Send to per-instance output (full content for split-pane)
            activityLog.claudeOutput(instanceId, "stdout", display);
            // Send to activity log as info so it shows in the main stream
            activityLog.info("claude:live", display, repoLabel);
          }

          // Accumulate final assistant text
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                finalText += block.text;
              }
            }
          }

          // Capture cost from result event
          if (event.type === "result") {
            if (event.total_cost_usd !== undefined) {
              costUsd = event.total_cost_usd;
            } else if (event.cost_usd !== undefined) {
              costUsd = event.cost_usd;
            }
            if (event.result) {
              finalText = event.result;
            }
          }
        } catch {
          // Not valid JSON — might be a partial line or plain text
          if (trimmed.length > 0) {
            activityLog.claudeOutput(instanceId, "stdout", trimmed);
            activityLog.info("claude:live", trimmed, repoLabel);
          }
        }
      }
    });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      const lines = chunk.split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        activityLog.claudeOutput(instanceId, "stderr", line);
        activityLog.warn("claude:stderr", line.slice(0, 500), repoLabel);
      }
    });

    const timeout = opts.timeout ?? 600_000;
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      activityLog.error("claude", "Process timed out", repoLabel);
      activityLog.claudeEnd(instanceId, false, undefined, `Timed out after ${timeout}ms`);
      resolve({ success: false, output: finalText || rawStdout, error: `Timed out after ${timeout}ms` });
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);

      // Process any remaining buffer
      if (lineBuf.trim()) {
        try {
          const event = JSON.parse(lineBuf.trim());
          const display = formatStreamEvent(event);
          if (display) {
            activityLog.claudeOutput(instanceId, "stdout", display);
            activityLog.info("claude:live", display, repoLabel);
          }
          if (event.type === "result") {
            if (event.result) finalText = event.result;
            if (event.total_cost_usd !== undefined) costUsd = event.total_cost_usd;
            else if (event.cost_usd !== undefined) costUsd = event.cost_usd;
          }
        } catch { /* ignore */ }
      }

      if (code !== 0) {
        activityLog.error("claude", `Exited with code ${code}`, repoLabel);
        const errMsg = stderr || `Exit code: ${code}`;
        activityLog.claudeEnd(instanceId, false, undefined, errMsg);
        resolve({ success: false, output: finalText || rawStdout, error: errMsg });
        return;
      }

      activityLog.info("claude", "Completed successfully", repoLabel);
      activityLog.claudeEnd(instanceId, true, costUsd);

      // If caller wanted JSON, try parsing the final text
      let parsed: any = undefined;
      if (opts.outputFormat === "json" || opts.jsonSchema) {
        try {
          parsed = JSON.parse(finalText);
        } catch {
          logger.warn("Failed to parse Claude output as JSON");
        }
      }

      resolve({ success: true, output: finalText || rawStdout, parsed, costUsd });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      activityLog.error("claude", `Spawn error: ${err.message}`, repoLabel);
      activityLog.claudeEnd(instanceId, false, undefined, err.message);
      resolve({ success: false, output: "", error: err.message });
    });
  });
}

/**
 * Format a stream-json event into a human-readable line for the dashboard.
 * Returns null if the event should not be displayed.
 */
function formatStreamEvent(event: any): string | null {
  switch (event.type) {
    case "system":
      return `[system] ${event.subtype ?? ""} ${event.message ?? ""}`.trim();

    case "assistant":
      if (event.message?.content) {
        const parts: string[] = [];
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            parts.push(block.text);
          } else if (block.type === "tool_use") {
            parts.push(`[tool] ${block.name}(${summarizeInput(block.input)})`);
          }
        }
        return parts.join(" ") || null;
      }
      return null;

    case "user":
      // Tool results
      if (event.message?.content) {
        const parts: string[] = [];
        for (const block of event.message.content) {
          if (block.type === "tool_result") {
            const content = typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c: any) => c.text ?? "").join("")
                : "";
            const preview = content.slice(0, 300).replace(/\n/g, " ");
            const status = block.is_error ? "ERROR" : "ok";
            parts.push(`[result:${status}] ${preview}`);
          }
        }
        return parts.length > 0 ? parts.join(" | ") : null;
      }
      return null;

    case "result":
      const cost = event.cost_usd != null ? ` ($${event.cost_usd.toFixed(4)})` : "";
      const duration = event.duration_ms != null ? ` in ${(event.duration_ms / 1000).toFixed(1)}s` : "";
      return `[done]${duration}${cost}`;

    default:
      return null;
  }
}

/**
 * Summarize tool input for display — show key params briefly.
 */
function summarizeInput(input: any): string {
  if (!input || typeof input !== "object") return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(input)) {
    const s = typeof val === "string" ? val.slice(0, 80) : JSON.stringify(val).slice(0, 80);
    parts.push(`${key}=${s}`);
  }
  return parts.join(", ").slice(0, 200);
}

function escapeArg(arg: string): string {
  if (/[ "&|<>^'\n\r\t]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}
