import { describe, expect, it } from "vitest";

import {
  screenPointFromNormalized,
  screenRegionFromDrag,
} from "./screen-region-selection";

describe("screenRegionFromDrag", () => {
  it("converts a normalized drag to frame pixel coordinates", () => {
    expect(
      screenRegionFromDrag(
        { x: 0.1, y: 0.2 },
        { x: 0.6, y: 0.7 },
        1000,
        2000,
      ),
    ).toEqual({ x: 100, y: 400, width: 500, height: 1000 });
  });

  it("normalizes a reverse drag", () => {
    expect(
      screenRegionFromDrag(
        { x: 0.6, y: 0.7 },
        { x: 0.1, y: 0.2 },
        1000,
        2000,
      ),
    ).toEqual({ x: 100, y: 400, width: 500, height: 1000 });
  });

  it("keeps a click at the frame edge inside a one-pixel region", () => {
    expect(
      screenRegionFromDrag({ x: 1, y: 1 }, { x: 1, y: 1 }, 1000, 2000),
    ).toEqual({ x: 999, y: 1999, width: 1, height: 1 });
  });
});

describe("screenPointFromNormalized", () => {
  it("converts a normalized point to frame pixel coordinates", () => {
    expect(
      screenPointFromNormalized({ x: 0.1, y: 0.2 }, 1000, 2000),
    ).toEqual({ x: 100, y: 400 });
  });

  it("clamps points at the frame edges", () => {
    expect(
      screenPointFromNormalized({ x: 1, y: 1 }, 1000, 2000),
    ).toEqual({ x: 999, y: 1999 });
    expect(
      screenPointFromNormalized({ x: 0, y: 0 }, 1000, 2000),
    ).toEqual({ x: 0, y: 0 });
  });

  it("guards against degenerate frame dimensions", () => {
    expect(screenPointFromNormalized({ x: 0.5, y: 0.5 }, 0, 0)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
