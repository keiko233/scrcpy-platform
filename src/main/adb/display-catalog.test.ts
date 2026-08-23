import { assert, describe, it } from "vitest";

import {
  filterManageableDisplays,
  mergeDisplayCatalog,
  parseDisplayDetails,
  parseDisplayIds,
} from "./display-catalog";

describe("display catalog", () => {
  it("parses display ids emitted by cmd display", () => {
    assert.deepEqual(parseDisplayIds("0\n  2\r\nnoise\n"), [0, 2]);
  });

  it("merges physical and virtual display evidence", () => {
    const details = parseDisplayDetails(`
Display 0:
  mDisplayInfo=DisplayInfo{"Built-in Screen", uniqueId "local:0"}
  FLAG_DEFAULT_DISPLAY
Display 7:
  DisplayDeviceInfo{"scrcpy", uniqueId "virtual:android-platform"}
  type VIRTUAL
`);
    const result = mergeDisplayCatalog(details, [0, 7], new Set([7]), new Set([7]));

    assert.deepEqual(result, [
      {
        displayId: 0,
        name: "Built-in Screen",
        kind: "physical",
        primary: true,
        ownedBySession: false,
      },
      {
        displayId: 7,
        name: "scrcpy",
        kind: "virtual",
        primary: false,
        ownedBySession: true,
      },
    ]);
  });

  it("marks multiple virtual displays as owned", () => {
    const result = mergeDisplayCatalog(
      [],
      [0, 7, 9],
      new Set([7, 9]),
      new Set([7, 9]),
    );

    assert.deepEqual(
      result.filter((display) => display.ownedBySession).map((display) => display.displayId),
      [7, 9],
    );
  });

  it("hides system-reserved virtual displays", () => {
    const main = {
      displayId: 0,
      name: "Built-in Screen",
      kind: "physical" as const,
      primary: true,
      ownedBySession: false,
    };
    const systemVirtual = {
      displayId: 2,
      name: "Miracast",
      kind: "virtual" as const,
      primary: false,
      ownedBySession: false,
    };
    const scrcpyVirtual = {
      displayId: 7,
      name: "scrcpy",
      kind: "virtual" as const,
      primary: false,
      ownedBySession: true,
    };

    assert.deepEqual(
      filterManageableDisplays([main, systemVirtual, scrcpyVirtual], true),
      [main, scrcpyVirtual],
    );
    assert.deepEqual(
      filterManageableDisplays([main, systemVirtual, scrcpyVirtual], false),
      [main, scrcpyVirtual],
    );
  });

  it("drops a scrcpy-named display once its owner is gone", () => {
    const main = {
      displayId: 0,
      name: "Built-in Screen",
      kind: "physical" as const,
      primary: true,
      ownedBySession: false,
    };
    const leftoverScrcpy = {
      displayId: 7,
      name: "scrcpy",
      kind: "virtual" as const,
      primary: false,
      ownedBySession: false,
    };

    assert.deepEqual(
      filterManageableDisplays([main, leftoverScrcpy], true),
      [main, leftoverScrcpy],
    );
    assert.deepEqual(
      filterManageableDisplays([main, leftoverScrcpy], false),
      [main],
    );
  });
});
