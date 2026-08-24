import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_START_TIMEOUT_MS = 10_000;

export interface EnsureAdbServerOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  timeoutMs?: number;
}

export class AdbServerStartError extends Error {
  readonly executable: string | null;

  constructor(message: string, executable: string | null = null) {
    super(message);
    this.name = "AdbServerStartError";
    this.executable = executable;
  }
}

/**
 * Returns the executable candidates available to an Electron main process.
 * Packaged apps launched from Finder do not necessarily inherit the shell PATH,
 * so the common Android SDK and Homebrew locations are included explicitly.
 */
export function getAdbExecutableCandidates(
  options: Pick<EnsureAdbServerOptions, "env" | "platform" | "homeDirectory"> = {},
): string[] {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? homedir();
  const executableName = platform === "win32" ? "adb.exe" : "adb";
  const candidates: string[] = [];

  const add = (candidate: string | undefined): void => {
    if (candidate !== undefined && candidate.length > 0 && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  add(env.ADB_PATH);
  for (const pathEntry of (env.PATH ?? "").split(delimiter)) {
    if (pathEntry.length > 0) {
      add(join(pathEntry, executableName));
    }
  }

  for (const sdkRoot of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (sdkRoot !== undefined && sdkRoot.length > 0) {
      add(join(sdkRoot, "platform-tools", executableName));
    }
  }

  if (platform === "darwin") {
    add(join(homeDirectory, "Library", "Android", "sdk", "platform-tools", executableName));
    add(`/opt/homebrew/bin/${executableName}`);
    add(`/usr/local/bin/${executableName}`);
  } else if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    if (localAppData !== undefined && localAppData.length > 0) {
      add(join(localAppData, "Android", "Sdk", "platform-tools", executableName));
    }
  } else {
    add(join(homeDirectory, "Android", "Sdk", "platform-tools", executableName));
  }

  return candidates;
}

async function findAdbExecutable(
  options: Pick<EnsureAdbServerOptions, "env" | "platform" | "homeDirectory">,
): Promise<string | null> {
  for (const candidate of getAdbExecutableCandidates(options)) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return null;
}

function startAdbServer(
  executable: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["start-server"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new AdbServerStartError(`Timed out after ${timeoutMs}ms`, executable));
    }, timeoutMs);

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new AdbServerStartError(error.message, executable));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      reject(
        new AdbServerStartError(
          detail.length > 0 ? detail : `adb start-server exited with code ${code ?? "unknown"}`,
          executable,
        ),
      );
    });
  });
}

/** Starts the local ADB server when it is not already running. */
export async function ensureAdbServer(
  options: EnsureAdbServerOptions = {},
): Promise<{ executable: string }> {
  const env = options.env ?? process.env;
  const executable = await findAdbExecutable(options);
  if (executable === null) {
    throw new AdbServerStartError(
      "adb was not found. Install Android SDK platform-tools or set ADB_PATH.",
    );
  }
  await startAdbServer(
    executable,
    env,
    options.timeoutMs ?? DEFAULT_START_TIMEOUT_MS,
  );
  return { executable };
}
