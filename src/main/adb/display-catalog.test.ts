import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findAddedVirtualDisplayId,
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
    const result = mergeDisplayCatalog(details, [0, 7], new Set([7]), 7);

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

  it("finds only a newly added display", () => {
    const main = {
      displayId: 0,
      name: "Main",
      kind: "physical" as const,
      primary: true,
      ownedBySession: false,
    };
    const virtual = {
      displayId: 9,
      name: "Virtual",
      kind: "virtual" as const,
      primary: false,
      ownedBySession: true,
    };

    assert.equal(findAddedVirtualDisplayId([main], [main, virtual]), 9);
    assert.equal(findAddedVirtualDisplayId([main, virtual], [main, virtual]), undefined);
  });
});
