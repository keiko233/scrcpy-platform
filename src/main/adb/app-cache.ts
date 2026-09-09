import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FilePath } from "../../shared/constants/app";

export interface CachedAppMetadata {
  name: string;
  cachedAt: number;
}

export type AppMetadataCache = Record<string, CachedAppMetadata>;

interface CacheFile {
  version: number;
  entries: AppMetadataCache;
}

/**
 * Bumped whenever the resolution logic changes so previously cached metadata
 * (e.g. stale package-name fallbacks or missing icons) is re-extracted instead
 * of served for another TTL window.
 */
const CACHE_VERSION = 1;

const isCacheFile = (value: unknown): value is CacheFile =>
  typeof value === "object" &&
  value !== null &&
  (value as CacheFile).version === CACHE_VERSION &&
  typeof (value as CacheFile).entries === "object" &&
  (value as CacheFile).entries !== null;

/**
 * Persists resolved app metadata (display name) to a JSON file under the user
 * data directory so repeat lookups never touch the device. Instances share a
 * single in-memory copy and serialize writes.
 */
export class AppMetadataCacheStore {
  readonly #file: string;
  #loadPromise: Promise<AppMetadataCache> | null = null;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, scope: string | null = null) {
    const suffix = scope === null
      ? ""
      : `.${scope.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    this.#file = join(
      userDataPath,
      `${FilePath.APP_CACHE_FILE}${suffix}`,
    );
  }

  load(): Promise<AppMetadataCache> {
    this.#loadPromise ??= this.#read();
    return this.#loadPromise;
  }

  async update(entries: AppMetadataCache): Promise<void> {
    const run = this.#writeQueue.then(async () => {
      const cache = await this.load();
      for (const [packageName, entry] of Object.entries(entries)) {
        cache[packageName] = entry;
      }
      await this.#write();
    });
    this.#writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #read(): Promise<AppMetadataCache> {
    try {
      const raw = await readFile(this.#file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (isCacheFile(parsed)) {
        return parsed.entries;
      }
    } catch {
      // Missing or corrupt cache is treated as empty.
    }
    return {};
  }

  async #write(): Promise<void> {
    const entries = await this.load();
    await mkdir(dirname(this.#file), { recursive: true });
    const payload: CacheFile = { version: CACHE_VERSION, entries };
    await writeFile(this.#file, JSON.stringify(payload), "utf8");
  }
}
