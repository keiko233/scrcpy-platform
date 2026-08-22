import { BrowserWindow } from "electron";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LogEntry, LogLevel } from "../../shared/electron-api";
import { ElectronChannel } from "../../shared/constants/enums";
import { LogLimits } from "../../shared/constants/limits";

const LOG_CHANNEL = ElectronChannel.LogsEntry;
const MAX_LOG_FILE_BYTES = LogLimits.MAX_FILE_BYTES;
const ANSI_RESET = "\u001b[0m";
const ANSI_DIM = "\u001b[2m";
const ANSI_SOURCE = "\u001b[90m";
const ANSI_LOCATION = "\u001b[35m";
const ANSI_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\u001b[37m",
  info: "\u001b[34m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
};

export class Logger {
  readonly #filePath: string;
  #nextId = 1;
  #sourceMap: TraceMap | null | undefined;
  readonly #originalConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  constructor(filePath: string) {
    this.#filePath = filePath;
    this.#nextId = this.list(1)[0]?.id + 1 || 1;
  }

  install(): void {
    for (const level of ["debug", "info", "warn", "error"] as const) {
      console[level] = (...args: unknown[]) => {
        this.write(level, args, "main");
      };
    }
  }

  captureRenderer(level: LogLevel, args: unknown[], location: string | null): void {
    this.write(level, args, "renderer", location);
  }

  list(limit = LogLimits.DEFAULT_LIST_LIMIT): LogEntry[] {
    const entries = this.readEntries();
    return entries
      .slice(-Math.max(LogLimits.MIN_LIST_LIMIT, Math.min(limit, LogLimits.MAX_LIST_LIMIT)))
      .reverse();
  }

  clear(): void {
    try {
      if (existsSync(this.#filePath)) {
        unlinkSync(this.#filePath);
      }
      this.#nextId = 1;
    } catch (error) {
      this.#originalConsole.error("Failed to clear log file", error);
    }
  }

  dispose(): void {
    for (const level of ["debug", "info", "warn", "error"] as const) {
      console[level] = this.#originalConsole[level];
    }
  }

  private write(
    level: LogLevel,
    args: unknown[],
    source: LogEntry["source"],
    location = source === "main" ? this.getCallerLocation() : null,
  ): void {
    const message = args
      .map((value) => {
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        if (typeof value === "string") return value;
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(" ");
    const createdAt = new Date().toISOString();
    const entry: LogEntry = {
      id: this.#nextId++,
      level,
      message,
      source,
      createdAt,
      location,
    };
    const levelLabel = `${ANSI_LEVEL_COLORS[level]}${level.toUpperCase()}${ANSI_RESET}`;
    const sourceLabel = `${ANSI_SOURCE}[${source}]${ANSI_RESET}`;
    const locationLabel = location
      ? ` ${ANSI_LOCATION}${location}${ANSI_RESET}`
      : "";
    this.#originalConsole[level](
      `${ANSI_DIM}${createdAt}${ANSI_RESET} ${levelLabel} ${sourceLabel}${locationLabel} ${message}`,
    );
    this.writeFile(entry);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(LOG_CHANNEL, entry);
    }
  }

  private getCallerLocation(): string | null {
    const stack = new Error().stack?.split("\n").slice(1) ?? [];
    for (const line of stack) {
      if (
        line.includes("/logging/logger.") ||
        line.includes("Logger.getCallerLocation") ||
        line.includes("Logger.write")
      ) {
        continue;
      }
      const location = this.mapLocation(line.trim().replace(/^at /, ""));
      if (location?.includes("src/main/logging/logger.ts:")) {
        continue;
      }
      return location;
    }
    return null;
  }

  private mapLocation(location: string | null): string | null {
    if (location === null) {
      return null;
    }
    const match = location.match(/\(?(.+?):(\d+):(\d+)\)?$/);
    if (match === null) {
      return location;
    }
    const [, , line, column] = match;
    try {
      if (this.#sourceMap === undefined) {
        const bundlePath = fileURLToPath(import.meta.url);
        const mapPath = `${bundlePath}.map`;
        this.#sourceMap = existsSync(mapPath)
          ? new TraceMap(readFileSync(mapPath, "utf8"))
          : null;
      }
      if (this.#sourceMap === null) {
        return location;
      }
      const original = originalPositionFor(this.#sourceMap, {
        line: Number(line),
        column: Number(column),
      });
      if (original.source === null || original.line === null) {
        return location;
      }
      const sourcePath = original.source.startsWith("file://")
        ? fileURLToPath(original.source)
        : resolve(dirname(fileURLToPath(import.meta.url)), original.source);
      const sourceLabel = sourcePath.match(/(?:^|\/)src\/.*$/)?.[0]?.slice(1) ?? sourcePath;
      return `${sourceLabel}:${original.line}:${(original.column ?? 0) + 1}`;
    } catch {
      return location;
    }
  }

  private writeFile(entry: LogEntry): void {
    try {
      if (existsSync(this.#filePath) && statSync(this.#filePath).size >= MAX_LOG_FILE_BYTES) {
        const rotatedPath = `${this.#filePath}.1`;
        if (existsSync(rotatedPath)) {
          unlinkSync(rotatedPath);
        }
        renameSync(this.#filePath, rotatedPath);
      }
      appendFileSync(this.#filePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      this.#originalConsole.error("Failed to write log file", error);
    }
  }

  private readEntries(): LogEntry[] {
    try {
      if (!existsSync(this.#filePath)) {
        return [];
      }
      return readFileSync(this.#filePath, "utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .flatMap((line) => {
          try {
            const entry = JSON.parse(line) as LogEntry;
            return entry.id && entry.createdAt ? [entry] : [];
          } catch {
            return [];
          }
        });
    } catch (error) {
      this.#originalConsole.error("Failed to read log file", error);
      return [];
    }
  }
}