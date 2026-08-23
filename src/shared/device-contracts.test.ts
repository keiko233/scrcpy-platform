import { assert, describe, test } from "vitest";
import {
  WirelessAddressSchema,
  WirelessPairInputSchema,
} from "./device-contracts";

describe("wireless device contracts", () => {
  test("accepts IPv4, host, and bracketed IPv6 addresses", () => {
    assert.equal(
      WirelessAddressSchema.parse(" 192.168.1.10:5555 "),
      "192.168.1.10:5555",
    );
    assert.equal(WirelessAddressSchema.parse("phone.local:37099"), "phone.local:37099");
    assert.equal(
      WirelessAddressSchema.parse("[fe80::1234]:5555"),
      "[fe80::1234]:5555",
    );
  });

  test("rejects malformed addresses and pairing codes", () => {
    assert.throws(() => WirelessAddressSchema.parse("192.168.1.10"));
    assert.throws(() => WirelessAddressSchema.parse("192.168.1.10:65536"));
    assert.throws(() =>
      WirelessPairInputSchema.parse({
        address: "192.168.1.10:37099",
        password: "12345",
      }),
    );
  });
});
