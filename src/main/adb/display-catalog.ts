import type { AndroidDisplayDto } from "../../shared/screen-contracts";

interface ParsedDisplay {
  displayId: number;
  name: string;
  virtual: boolean;
  primary: boolean;
}

export function parseDisplayIds(output: string): number[] {
  return [...output.matchAll(/^\s*(\d+)\s*$/gm)].map((match) =>
    Number(match[1]),
  );
}

export function parseDisplayDetails(output: string): ParsedDisplay[] {
  const matches = [...output.matchAll(/^\s*Display\s+(\d+):/gm)];
  const displays = new Map<number, ParsedDisplay>();

  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? output.length;
    const block = output.slice(start, end);
    const displayId = Number(match[1]);
    const fallbackName = `Display ${displayId}`;
    const name =
      block.match(
        /(?:mDisplayInfo=DisplayInfo|DisplayDeviceInfo)\{"([^"]+)"/,
      )?.[1] ?? fallbackName;
    const uniqueId = block.match(/uniqueId\s*[=:]?\s*"?([^",}\s]+)/)?.[1];
    const virtual =
      uniqueId?.startsWith("virtual:") === true ||
      /\btype\s+VIRTUAL\b/.test(block);
    const next: ParsedDisplay = {
      displayId,
      name,
      virtual,
      primary: !virtual && /\bFLAG_DEFAULT_DISPLAY\b/.test(block),
    };
    const current = displays.get(displayId);
    displays.set(
      displayId,
      current === undefined
        ? next
        : {
            displayId,
            name:
              current.name === fallbackName && name !== fallbackName
                ? name
                : current.name,
            virtual: current.virtual || next.virtual,
            primary: current.primary || next.primary,
          },
    );
  }

  return [...displays.values()];
}

export function mergeDisplayCatalog(
  details: readonly ParsedDisplay[],
  displayIds: readonly number[],
  virtualIds: ReadonlySet<number>,
  ownedVirtualDisplayIds: ReadonlySet<number>,
): AndroidDisplayDto[] {
  const authoritativeIds =
    displayIds.length > 0 ? new Set(displayIds) : undefined;
  const displays = new Map<number, AndroidDisplayDto>();

  for (const detail of details) {
    if (authoritativeIds !== undefined && !authoritativeIds.has(detail.displayId)) {
      continue;
    }
    const virtual = detail.virtual || virtualIds.has(detail.displayId);
    displays.set(detail.displayId, {
      displayId: detail.displayId,
      name: detail.name,
      kind: virtual ? "virtual" : "physical",
      primary: detail.primary && !virtual,
      ownedBySession: ownedVirtualDisplayIds.has(detail.displayId),
    });
  }

  for (const displayId of displayIds) {
    const current = displays.get(displayId);
    const virtual = virtualIds.has(displayId);
    if (current === undefined) {
      displays.set(displayId, {
        displayId,
        name: `Display ${displayId}`,
        kind: virtual ? "virtual" : "physical",
        primary: displayId === 0 && !virtual,
        ownedBySession: ownedVirtualDisplayIds.has(displayId),
      });
    } else if (virtual || ownedVirtualDisplayIds.has(displayId)) {
      displays.set(displayId, {
        ...current,
        kind: "virtual",
        primary: false,
        ownedBySession: ownedVirtualDisplayIds.has(displayId),
      });
    }
  }

  const result = [...displays.values()].sort(
    (left, right) => left.displayId - right.displayId,
  );
  if (!result.some((display) => display.primary)) {
    const fallback = result.find(
      (display) => display.displayId === 0 && display.kind === "physical",
    );
    if (fallback !== undefined) {
      fallback.primary = true;
    }
  }
  return result;
}

const SCRCPY_DISPLAY_NAME = "scrcpy";

/**
 * Keeps only displays this app can actually stream: physical displays and
 * scrcpy-owned virtual displays. Android exposes system-reserved virtual
 * displays (e.g. Miracast/presentation screens) that exist before any scrcpy
 * session and cannot be mirrored, so they are hidden to avoid a tab that never
 * switches.
 *
 * While a virtual-display owner is alive (`keepScrcpyNamed`), a scrcpy-named
 * display is also kept so it can be discovered before ownership is recorded.
 * Once the owner is gone, any scrcpy-named display is a stale leftover and is
 * dropped from the list.
 */
export function filterManageableDisplays(
  displays: readonly AndroidDisplayDto[],
  keepScrcpyNamed: boolean,
): AndroidDisplayDto[] {
  return displays.filter(
    (display) =>
      display.kind === "physical" ||
      display.ownedBySession ||
      (keepScrcpyNamed && display.name === SCRCPY_DISPLAY_NAME),
  );
}
