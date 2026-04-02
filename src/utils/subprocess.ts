import { spawn } from "child_process";
import { logger } from "./logger.js";

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SubprocessOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

const isWindows = process.platform === "win32";

export async function runSubprocess(
  command: string,
  args: string[],
  opts: SubprocessOptions = {}
): Promise<SubprocessResult> {
  const { cwd, timeout = 120_000, env } = opts;

  return new Promise((resolve, reject) => {
    // On Windows, we need shell for resolving .cmd/.bat wrappers (gh, claude, etc.)
    // Combine command + args into a single string to avoid the DEP0190 warning
    const fullCommand = isWindows
      ? `${command} ${args.map(escapeArgWin).join(" ")}`
      : command;

    const spawnArgs = isWindows ? [] : args;

    const proc = spawn(fullCommand, spawnArgs, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeout}ms: ${command} ${args.join(" ")}`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Escape a shell argument for Windows cmd.exe */
function escapeArgWin(arg: string): string {
  if (/[ "&|<>^]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

export async function runGit(args: string[], cwd?: string): Promise<SubprocessResult> {
  logger.debug({ cmd: `git ${args.join(" ")}`, cwd }, "git command");
  return runSubprocess("git", args, { cwd });
}

export async function runGh(args: string[], cwd?: string): Promise<SubprocessResult> {
  logger.debug({ cmd: `gh ${args.join(" ")}`, cwd }, "gh command");
  return runSubprocess("gh", args, { cwd });
}
