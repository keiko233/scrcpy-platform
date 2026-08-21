export function findDisplayUniqueId(dumpsys: string, displayId: number): string {
  const escapedId = String(displayId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const viewport = new RegExp(
    `DisplayViewport\\{[^}]*displayId=${escapedId},\\s*uniqueId='([^']+)'`,
  ).exec(dumpsys);
  if (viewport !== null) {
    return viewport[1];
  }

  const logicalDisplay = new RegExp(
    `(?:^|\\n)\\s*Display ${escapedId}:([\\s\\S]*?)(?=\\n\\s*Display \\d+:|$)`,
  ).exec(dumpsys);
  const uniqueId = logicalDisplay?.[1].match(/uniqueId\s+["']([^"']+)["']/)?.[1];
  if (uniqueId !== undefined) {
    return uniqueId;
  }
  throw new Error(`Android display ${displayId} is no longer available.`);
}

export function physicalSurfaceFlingerDisplayId(uniqueId: string): string | null {
  const physical = /^local:(\d+)$/.exec(uniqueId);
  return physical?.[1] ?? null;
}

/**
 * SurfaceFlinger assigns virtual display IDs randomly. Its dump exposes the
 * association through the virtual display's layer stack, which Android's
 * DisplayManager sets to the logical display ID.
 */
export function findVirtualSurfaceFlingerDisplayId(
  surfaceFlingerDump: string,
  logicalDisplayId: number,
): string {
  const displays = surfaceFlingerDump.matchAll(
    /Display (\d+) \(virtual,[^\n]*\)\s+Composition Display State:([\s\S]*?)(?=\nDisplay \d+ \(|$)/g,
  );
  for (const display of displays) {
    const layerStack = display[2].match(/layerFilter=\{layerStack=(\d+)\b/)?.[1];
    if (layerStack === String(logicalDisplayId)) {
      return display[1];
    }
  }
  throw new Error(
    `SurfaceFlinger did not expose virtual display ${logicalDisplayId}; it may have closed.`,
  );
}
