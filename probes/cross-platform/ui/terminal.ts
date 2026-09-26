import { Channel, invoke } from "@tauri-apps/api/core";
import type { Terminal } from "@xterm/xterm";

export const PROBE_CHUNK_BYTES = 16 * 1024;
export const PROBE_CHUNK_COUNT = 64;
export const PROBE_TOTAL_BYTES = PROBE_CHUNK_BYTES * PROBE_CHUNK_COUNT;

const TERMINAL_SAMPLE = new Uint8Array([
  ...new TextEncoder().encode("SelfTerm"),
  0x00, 0x1b, 0x5b, 0x33, 0x32, 0x6d,
  ...new TextEncoder().encode("Rust "),
  0xf0, 0x9f, 0x8c, 0x90,
  0x1b, 0x5b, 0x30, 0x6d, 0x20, 0xff, 0x20,
]);

function expectedByte(offset: number): number {
  return TERMINAL_SAMPLE[offset % TERMINAL_SAMPLE.byteLength];
}

export async function streamRustOutput(terminal: Terminal): Promise<number> {
  const received = new Uint8Array(PROBE_TOTAL_BYTES);
  let offset = 0;
  let pendingWrites = 0;
  let streamFinished = false;
  let settled = false;
  const started = performance.now();
  let finish!: (duration: number) => void;
  let fail!: (error: Error) => void;
  const result = new Promise<number>((resolve, reject) => {
    finish = (duration) => { if (!settled) { settled = true; resolve(duration); } };
    fail = (error) => { if (!settled) { settled = true; reject(error); } };
  });

  const output = new Channel<ArrayBuffer>();
  output.onmessage = (buffer) => {
    const chunk = new Uint8Array(buffer);
    if (offset + chunk.byteLength > received.byteLength) {
      fail(new Error("Rust stream exceeded the 1 MiB probe bound"));
      return;
    }
    received.set(chunk, offset);
    pendingWrites += 1;
    terminal.write(chunk, () => {
      pendingWrites -= 1;
      if (streamFinished && offset === received.byteLength && pendingWrites === 0) {
        finish(performance.now() - started);
      }
    });
    offset += chunk.byteLength;

    if (offset === received.byteLength) {
      for (let index = 0; index < received.length; index += 1) {
        if (received[index] !== expectedByte(index)) {
          fail(new Error(`Raw byte mismatch at offset ${index}`));
          return;
        }
      }
      streamFinished = true;
      if (pendingWrites === 0) finish(performance.now() - started);
    }
  };

  let timeout = 0;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error("Raw-byte stream timed out")), 15_000);
  });
  try {
    const completed = Promise.all([invoke<void>("stream_probe", { output }), result])
      .then(([, duration]) => duration);
    return await Promise.race([completed, timedOut]);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function echoTerminalInput(terminal: Terminal, input: string): Promise<void> {
  const sent = new TextEncoder().encode(input);
  const output = new Channel<ArrayBuffer>();
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const echoed = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  output.onmessage = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const matches = bytes.length === sent.length && bytes.every((byte, index) => byte === sent[index]);
    terminal.write(bytes);
    if (matches) finish();
    else fail(new Error("Terminal input echo changed bytes"));
  };
  let timeout = 0;
  try {
    await invoke("echo_input", { input: Array.from(sent), output });
    await Promise.race([
      echoed,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error("Input echo timed out")), 5_000);
      }),
    ]);
    console.info(`probe: validated terminal input round-trip (${sent.length} bytes)`);
  } finally {
    window.clearTimeout(timeout);
  }
}
