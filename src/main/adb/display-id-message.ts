import type { ScrcpyDeviceMessageParser } from "@yume-chan/scrcpy";
import type { AsyncExactReadable } from "@yume-chan/struct";

/** scrcpy 3.x device message type emitted after `--new-display` is ready. */
export class DisplayIdDeviceMessageParser implements ScrcpyDeviceMessageParser {
  readonly id = 3;
  readonly displayId: Promise<number>;

  #resolve!: (displayId: number) => void;
  #reject!: (error: unknown) => void;
  #settled = false;
  #status: "pending" | "reported" | "closed" | "error" = "pending";

  constructor() {
    this.displayId = new Promise<number>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  async parse(_id: number, stream: AsyncExactReadable): Promise<undefined> {
    const data = await stream.readExactly(4);
    const displayId = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    ).getUint32(0, false);
    this.#settled = true;
    this.#status = "reported";
    console.info("scrcpy virtual display device message received", {
      messageId: this.id,
      displayId,
      payloadHex: [...data]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    });
    this.#resolve(displayId);
  }

  get status(): "pending" | "reported" | "closed" | "error" {
    return this.#status;
  }

  close(): void {
    if (!this.#settled) {
      this.#settled = true;
      this.#status = "closed";
      console.warn("scrcpy control channel closed before virtual display ID", {
        messageId: this.id,
      });
      this.#reject(new Error("scrcpy closed before reporting the virtual display ID"));
    }
  }

  error(error?: unknown): void {
    if (!this.#settled) {
      this.#settled = true;
      this.#status = "error";
      console.error("scrcpy device message parser failed", {
        messageId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.#reject(error ?? new Error("scrcpy display ID message failed"));
    }
  }
}
