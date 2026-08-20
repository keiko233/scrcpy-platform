import { BrowserWindow } from "electron";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import type { LogEntry, LogLevel } from "../../shared/electron-api";

const LOG_CHANNEL = "logs:entry";
const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;

export class Logger {
  readonly #filePath: string;
  #nextId = 1;
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

  list(limit = 500): LogEntry[] {
    const entries = this.readEntries();
    return entries.slice(-Math.max(1, Math.min(limit, 2000))).reverse();
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
    const output = `${createdAt} ${level.toUpperCase()} [${source}]${location ? ` ${location}` : ""} ${message}`;
    this.#originalConsole[level](output);
    this.writeFile(entry);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(LOG_CHANNEL, entry);
    }
  }

  private getCallerLocation(): string | null {
    const stack = new Error().stack?.split("\n").slice(1) ?? [];
    const caller = stack.find((line) => !line.includes("/logging/logger."));
    return caller?.trim().replace(/^at /, "") ?? null;
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