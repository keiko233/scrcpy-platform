import { assert, describe, expect, it } from "vitest";

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
    await expect(parser.displayId).rejects.toThrow(/closed before reporting/);
  });
});
