import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AsyncExactReadable } from "@yume-chan/struct";
import { DisplayIdDeviceMessageParser } from "./display-id-message";

describe("scrcpy display ID message", () => {
  it("parses the big-endian virtual display ID", async () => {
    const parser = new DisplayIdDeviceMessageParser();
    const stream: AsyncExactReadable = {
      position: 0,
      readExactly: async (length) => {
        assert.equal(length, 4);
        return Uint8Array.of(0, 0, 1, 2);
      },
    };

    await parser.parse(parser.id, stream);
    assert.equal(await parser.displayId, 258);
  });

  it("rejects when scrcpy closes before reporting an ID", async () => {
    const parser = new DisplayIdDeviceMessageParser();
    parser.close();
    await assert.rejects(parser.displayId, /closed before reporting/);
  });
});
