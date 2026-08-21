import { assert, describe, expect, test } from "vitest";

import {
  findDisplayUniqueId,
  findVirtualSurfaceFlingerDisplayId,
  physicalSurfaceFlingerDisplayId,
} from "./android-display-id";

describe("Android display ID mapping", () => {
  test("finds logical display unique IDs from viewports or display info", () => {
    assert.equal(
      findDisplayUniqueId(
        "mViewports=[DisplayViewport{type=VIRTUAL, valid=true, displayId=259, uniqueId='virtual:owner,1,name,2'}]",
        259,
      ),
      "virtual:owner,1,name,2",
    );
    assert.equal(
      findDisplayUniqueId(
        'Logical Displays:\n  Display 3:\n    mDisplayId=3\n    mBaseDisplayInfo=DisplayInfo{"screen", displayId 3, uniqueId "local:123"}',
        3,
      ),
      "local:123",
    );
  });

  test("maps physical display unique IDs directly", () => {
    assert.equal(
      physicalSurfaceFlingerDisplayId("local:4630946545580055170"),
      "4630946545580055170",
    );
    assert.equal(physicalSurfaceFlingerDisplayId("virtual:owner,1,name,2"), null);
  });

  test("maps a logical virtual display through its SurfaceFlinger layer stack", () => {
    const dump = `
Displays (2 entries)
Display 4630946545580055170
    name=""

Virtual Display 11529215046235404656
    name="scrcpy"

Display 4630946545580055170 (physical, "")
   Composition Display State:
   layerFilter={layerStack=4294967295 toInternalDisplay=true }

Display 11529215046235404656 (virtual, "scrcpy")
   Composition Display State:
   isEnabled=true isSecure=false
   layerFilter={layerStack=260 toInternalDisplay=false }
   transform (ROT_0) (IDENTITY)
`;
    assert.equal(
      findVirtualSurfaceFlingerDisplayId(dump, 260),
      "11529215046235404656",
    );
    expect(() => findVirtualSurfaceFlingerDisplayId(dump, 259)).toThrow(
      /may have closed/,
    );
  });
});
