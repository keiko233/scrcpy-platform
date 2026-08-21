import type { ScreenRegion } from "@/shared/project-contracts";

export interface NormalizedScreenPoint {
  x: number;
  y: number;
}

function axisRange(
  start: number,
  end: number,
  extent: number,
): { offset: number; length: number } {
  const boundedExtent = Math.max(1, Math.round(extent));
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const offset = Math.min(
    boundedExtent - 1,
    Math.max(0, Math.floor(lower * boundedExtent)),
  );
  const edge = Math.min(
    boundedExtent,
    Math.max(offset + 1, Math.ceil(upper * boundedExtent)),
  );
  return { offset, length: edge - offset };
}

export function screenRegionFromDrag(
  start: NormalizedScreenPoint,
  end: NormalizedScreenPoint,
  frameWidth: number,
  frameHeight: number,
): ScreenRegion {
  const horizontal = axisRange(start.x, end.x, frameWidth);
  const vertical = axisRange(start.y, end.y, frameHeight);
  return {
    x: horizontal.offset,
    y: vertical.offset,
    width: horizontal.length,
    height: vertical.length,
  };
}
