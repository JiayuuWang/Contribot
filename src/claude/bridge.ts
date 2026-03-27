import { runSubprocess } from "../utils/subprocess.js";
import { logger } from "../utils/logger.js";

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

  // The prompt goes last
  args.push("--", opts.prompt);

  logger.info(
    { cwd: opts.cwd, model: opts.model, prompt: opts.prompt.slice(0, 100) + "..." },
    "Invoking Claude"
  );

  try {
    const result = await runSubprocess("claude", args, {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 600_000, // 10 minutes default
    });

    if (result.exitCode !== 0) {
      logger.error({ stderr: result.stderr }, "Claude invocation failed");
      return {
        success: false,
        output: result.stdout,
        error: result.stderr || `Exit code: ${result.exitCode}`,
      };
    }

    let parsed: any = undefined;
    if (opts.outputFormat === "json" || opts.jsonSchema) {
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        // If JSON parse fails, return raw output
        logger.warn("Failed to parse Claude output as JSON");
      }
    }

    return {
      success: true,
      output: result.stdout,
      parsed,
    };
  } catch (err: any) {
    logger.error({ err }, "Claude invocation error");
    return {
      success: false,
      output: "",
      error: err.message,
    };
  }
}
