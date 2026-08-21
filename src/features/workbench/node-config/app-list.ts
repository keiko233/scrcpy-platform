import type { InstalledAppDto } from "@/shared/device-contracts";

export function normalizeAppQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function filterInstalledApps(
  apps: readonly InstalledAppDto[],
  query: string,
): readonly InstalledAppDto[] {
  const normalized = normalizeAppQuery(query);
  if (normalized.length === 0) {
    return apps;
  }
  return apps.filter(
    (app) =>
      app.name.toLowerCase().includes(normalized) ||
      app.packageName.toLowerCase().includes(normalized),
  );
}

export function findInstalledApp(
  apps: readonly InstalledAppDto[],
  packageName: string | null | undefined,
): InstalledAppDto | null {
  return apps.find((app) => app.packageName === packageName) ?? null;
}
