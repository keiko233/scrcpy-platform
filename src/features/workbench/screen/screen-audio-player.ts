import type { ScrcpyMediaStreamPacket } from "@yume-chan/scrcpy";
import { MediaConstants } from "@/shared/constants/app";
import { Timing } from "@/shared/constants/timing";

const DEFAULT_SAMPLE_RATE = MediaConstants.AUDIO_SAMPLE_RATE;
const FRAME_TIMESTAMP_STEP_US = Timing.FRAME_TIMESTAMP_STEP_US;

function codecToWebCodec(codec: string): string {
  switch (codec) {
    case "opus":
      return "opus";
    case "aac":
      return "mp4a.40.2";
    case "flac":
      return "flac";
    default:
      throw new Error(`Unsupported audio codec: ${codec}`);
  }
}

/**
 * Decodes and plays the scrcpy audio stream in the renderer. A single instance
 * is shared across the app because `AudioContext` and the decoder are global
 * resources; the screen video hook forwards audio messages into it.
 */
export class ScreenAudioPlayer {
  #context: AudioContext | null = null;
  #decoder: AudioDecoder | null = null;
  #codec: string | null = null;
  #sampleRate = DEFAULT_SAMPLE_RATE;
  #channels = 2;
  #description: Uint8Array | null = null;
  #timestamp = 0;
  #nextStartTime = 0;
  #disposed = false;

  configure(codec: string, sampleRate: number, channels: number): void {
    this.#codec = codec;
    this.#sampleRate = sampleRate;
    this.#channels = channels;
    this.#description = null;
    this.#teardownDecoder();
    this.#ensureContext();
  }

  feed(packet: ScrcpyMediaStreamPacket): void {
    if (this.#codec === null) {
      return;
    }
    if (packet.type === "configuration") {
      this.#description = packet.data.slice();
      this.#setupDecoder();
      return;
    }
    this.#decode(packet.data);
  }

  reset(): void {
    this.#teardownDecoder();
    this.#codec = null;
    this.#description = null;
    this.#nextStartTime = 0;
  }

  dispose(): void {
    this.#disposed = true;
    this.reset();
    void this.#context?.close().catch(() => undefined);
    this.#context = null;
  }

  #ensureContext(): void {
    if (this.#context !== null || this.#disposed) {
      return;
    }
    this.#context = new AudioContext({
      sampleRate: this.#sampleRate,
      latencyHint: "interactive",
    });
  }

  #teardownDecoder(): void {
    if (this.#decoder === null) {
      return;
    }
    if (this.#decoder.state !== "closed") {
      this.#decoder.close();
    }
    this.#decoder = null;
  }

  #setupDecoder(): void {
    if (this.#codec === null) {
      return;
    }
    this.#teardownDecoder();
    let codec: string;
    try {
      codec = codecToWebCodec(this.#codec);
    } catch (cause) {
      console.error("screen audio codec unsupported", cause);
      this.#codec = null;
      return;
    }
    const config: AudioDecoderConfig = {
      codec,
      sampleRate: this.#sampleRate,
      numberOfChannels: this.#channels,
    };
    if (this.#description !== null) {
      config.description = this.#description;
    }
    const decoder = new AudioDecoder({
      output: (data) => this.#play(data),
      error: (error) => {
        console.error("screen audio decode failed", error);
        this.#teardownDecoder();
      },
    });
    try {
      decoder.configure(config);
    } catch (cause) {
      console.error("screen audio decoder configuration failed", cause);
      decoder.close();
      this.#decoder = null;
      return;
    }
    this.#decoder = decoder;
    this.#timestamp = 0;
    this.#nextStartTime = 0;
  }

  #decode(data: Uint8Array): void {
    const decoder = this.#decoder;
    if (decoder === null || decoder.state !== "configured") {
      return;
    }
    try {
      const chunk = new EncodedAudioChunk({
        type: "key",
        timestamp: this.#timestamp,
        data,
      });
      this.#timestamp += FRAME_TIMESTAMP_STEP_US;
      decoder.decode(chunk);
    } catch (cause) {
      console.error("screen audio chunk rejected", cause);
    }
  }

  #play(data: AudioData): void {
    const context = this.#context;
    if (context === null || this.#disposed) {
      data.close();
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    try {
      const buffer = context.createBuffer(
        data.numberOfChannels,
        data.numberOfFrames,
        data.sampleRate,
      );
      for (let channel = 0; channel < data.numberOfChannels; channel += 1) {
        data.copyTo(buffer.getChannelData(channel), {
          planeIndex: channel,
          format: "f32-planar",
        });
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const startAt = Math.max(this.#nextStartTime, context.currentTime);
      source.start(startAt);
      this.#nextStartTime = startAt + buffer.duration;
    } catch (cause) {
      console.error("screen audio playback failed", cause);
    } finally {
      data.close();
    }
  }
}

export const screenAudioPlayer = new ScreenAudioPlayer();
