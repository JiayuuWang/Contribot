import { spawn } from "child_process";
import { randomUUID } from "crypto";
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

  // Prompt is passed as a CLI argument via `-- <prompt>`.
  // Collapse newlines to spaces: cmd.exe double-quoted strings cannot span
  // multiple lines, and LLMs handle single-line prompts identically.
  const singleLinePrompt = opts.prompt.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  args.push("--", singleLinePrompt);

  // On Windows, claude is a native .exe — must use shell:true so PATH is resolved.
  // Build the full command string and pass empty spawnArgs.
  const isWindows = process.platform === "win32";
  const command = isWindows ? `claude ${args.map(escapeArg).join(" ")}` : "claude";
  const spawnArgs = isWindows ? [] : args;

  const promptPreview = opts.prompt.slice(0, 80).replace(/\n/g, " ");
  logger.info({ cwd: opts.cwd, model: opts.model }, "Invoking Claude");
  activityLog.info("claude", `Invoking Claude: ${promptPreview}...`, repoLabel);

  return new Promise((resolve) => {
    const proc = spawn(command, spawnArgs, {
      cwd: opts.cwd,
      // NODE_OPTIONS forces TLS 1.2 in the claude subprocess.
      // Required because the API proxy (aipaibox.com) has TLS 1.3
      // renegotiation issues that cause all HTTPS POSTs to hang forever.
      env: { ...process.env, NODE_OPTIONS: "--tls-max-v1.2" },
      shell: true,
      // Use "ignore" for stdin — claude --print does not read from stdin,
      // and leaving it as "pipe" causes a 3-second wait warning on Windows.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
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
      activityLog.claudeEnd(instanceId, false, undefined, `Timed out after ${timeout}ms`);
      resolve({ success: false, output: stdout, error: `Timed out after ${timeout}ms` });
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        activityLog.error("claude", `Exited with code ${code}`, repoLabel);
        const errMsg = stderr || `Exit code: ${code}`;
        activityLog.claudeEnd(instanceId, false, undefined, errMsg);
        resolve({ success: false, output: stdout, error: errMsg });
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

      let costUsd: number | undefined;
      if (parsed?.usage?.cost_usd !== undefined) {
        costUsd = parsed.usage.cost_usd;
      }

      activityLog.claudeEnd(instanceId, true, costUsd);
      resolve({ success: true, output: stdout, parsed });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      activityLog.error("claude", `Spawn error: ${err.message}`, repoLabel);
      activityLog.claudeEnd(instanceId, false, undefined, err.message);
      resolve({ success: false, output: "", error: err.message });
    });
  });
}

function escapeArg(arg: string): string {
  // On Windows cmd.exe: wrap in double quotes if contains spaces or special chars.
  // Replace internal double quotes with escaped version.
  if (/[ "&|<>^'\n\r\t]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}
