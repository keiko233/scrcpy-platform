import type { ScrcpyDeviceMessageParser } from "@yume-chan/scrcpy";
import type { AsyncExactReadable } from "@yume-chan/struct";

/** scrcpy 3.x device message type emitted after `--new-display` is ready. */
export class DisplayIdDeviceMessageParser implements ScrcpyDeviceMessageParser {
  readonly id = 3;
  readonly displayId: Promise<number>;

  #resolve!: (displayId: number) => void;
  #reject!: (error: unknown) => void;
  #settled = false;

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
    this.#resolve(displayId);
  }

  close(): void {
    if (!this.#settled) {
      this.#settled = true;
      this.#reject(new Error("scrcpy closed before reporting the virtual display ID"));
    }
  }

  error(error?: unknown): void {
    if (!this.#settled) {
      this.#settled = true;
      this.#reject(error ?? new Error("scrcpy display ID message failed"));
    }
  }
}
