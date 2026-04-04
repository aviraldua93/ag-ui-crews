/**
 * Test helpers for server unit tests.
 * Provides mock SSEController factories and common utilities.
 */

/** Encoded chunks captured by a mock SSEController */
export interface MockSSEController {
  controller: ReadableStreamDefaultController<Uint8Array>;
  chunks: Uint8Array[];
  /** Decoded text from all enqueued chunks */
  text(): string;
  /** Whether the controller was closed */
  closed: boolean;
  /** Whether `enqueue` should throw (simulates a disconnected client) */
  failOnEnqueue: boolean;
}

/**
 * Creates a mock SSEController that captures enqueued chunks.
 * Use `mock.text()` to read back the SSE data that was sent.
 */
export function createMockSSEController(): MockSSEController {
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let closed = false;
  let failOnEnqueue = false;

  const mock: MockSSEController = {
    controller: {
      enqueue(chunk: Uint8Array) {
        if (failOnEnqueue) {
          throw new Error("Controller is closed (mock)");
        }
        chunks.push(chunk);
      },
      close() {
        closed = true;
      },
      error(_reason?: unknown) {
        closed = true;
      },
      get desiredSize() {
        return 1;
      },
    } as ReadableStreamDefaultController<Uint8Array>,
    chunks,
    text() {
      return chunks.map((c) => decoder.decode(c)).join("");
    },
    get closed() {
      return closed;
    },
    set closed(v: boolean) {
      closed = v;
    },
    get failOnEnqueue() {
      return failOnEnqueue;
    },
    set failOnEnqueue(v: boolean) {
      failOnEnqueue = v;
    },
  };

  return mock;
}

/**
 * Parse SSE `data:` lines from raw SSE text into parsed JSON objects.
 */
export function parseSSEEvents(raw: string): unknown[] {
  return raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
}

/**
 * Small delay helper for async tests.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
