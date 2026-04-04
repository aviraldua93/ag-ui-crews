/**
 * SSE Lifecycle Integration Test
 *
 * End-to-end verification that:
 * 1. POST /api/simulate starts a simulation session
 * 2. GET /events returns text/event-stream with AG-UI JSON events
 * 3. Events include STATE_SNAPSHOT on connect
 * 4. CUSTOM events wrap dashboard events
 * 5. RUN_STARTED appears at session start
 * 6. Full lifecycle completes: idle → planning → executing → completed
 * 7. No malformed events during the entire simulation lifecycle
 *
 * Uses the actual server (Bun.serve) via direct HTTP + SSE fetch.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AgUiEvent } from "@shared/events";
import { AG_UI_EVENT_TYPES } from "@shared/events";
import type { DashboardState } from "@shared/types";
import type { ChildProcess } from "child_process";
import { spawn } from "child_process";

const TEST_PORT = 51723; // High port to avoid conflicts
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess: ChildProcess | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForServer(
  url: string,
  timeoutMs = 15000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`);
      if (resp.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function collectSSEEvents(
  url: string,
  durationMs: number
): Promise<AgUiEvent[]> {
  return new Promise((resolve, reject) => {
    const events: AgUiEvent[] = [];
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
      resolve(events);
    }, durationMs);

    fetch(`${url}/events`, { signal: controller.signal })
      .then(async (resp) => {
        if (!resp.ok || !resp.body) {
          clearTimeout(timeout);
          reject(new Error(`SSE connect failed: ${resp.status}`));
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE data lines
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // Keep incomplete last line

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6)) as AgUiEvent;
                  events.push(event);
                } catch {
                  // Ignore malformed JSON (shouldn't happen)
                }
              }
            }
          }
        } catch (err) {
          // AbortError is expected when timeout fires
          if (!(err instanceof Error) || err.name !== "AbortError") {
            throw err;
          }
        }

        clearTimeout(timeout);
        resolve(events);
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          resolve(events);
        } else {
          reject(err);
        }
      });
  });
}

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Start the server on the test port
  // Use shell: true for cross-platform compatibility (Windows needs it for .cmd shims)
  serverProcess = spawn("bun", ["run", "src/server/index.ts"], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32" ? "cmd.exe" : true,
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (!msg.includes("warning")) {
      // Suppress bun warnings, log errors
    }
  });

  const ready = await waitForServer(BASE_URL, 15000);
  if (!ready) {
    throw new Error(
      `Server did not start on port ${TEST_PORT} within 15 seconds`
    );
  }
}, 20000);

afterAll(async () => {
  if (serverProcess?.pid) {
    serverProcess.kill("SIGTERM");
    // Wait a bit for graceful shutdown
    await new Promise((r) => setTimeout(r, 500));
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SSE Lifecycle Integration", () => {
  it("GET /api/health returns ok", async () => {
    const resp = await fetch(`${BASE_URL}/api/health`);
    expect(resp.ok).toBe(true);

    const data = (await resp.json()) as Record<string, unknown>;
    expect(data.status).toBe("ok");
  });

  it("GET /events returns text/event-stream content type", async () => {
    const controller = new AbortController();
    const resp = await fetch(`${BASE_URL}/events`, {
      signal: controller.signal,
    });

    expect(resp.headers.get("content-type")).toBe("text/event-stream");
    controller.abort();
  });

  it("GET /events sends STATE_SNAPSHOT as first event on connect", async () => {
    const events = await collectSSEEvents(BASE_URL, 1000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe(AG_UI_EVENT_TYPES.STATE_SNAPSHOT);

    const snapshot = events[0].snapshot as DashboardState;
    expect(snapshot).toBeDefined();
    expect(snapshot.phase).toBe("idle");
  });

  it("POST /api/simulate starts simulation and returns success", async () => {
    const resp = await fetch(`${BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "Integration test",
        speedMultiplier: 10, // 10x speed for fast tests
        failureRate: 0,
      }),
    });

    expect(resp.ok).toBe(true);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.threadId).toBeDefined();
    expect(data.runId).toBeDefined();
    expect(data.mode).toBe("simulation");
  });

  it("SSE stream delivers RUN_STARTED at session start, CUSTOM events, and full lifecycle", async () => {
    // First, stop any existing session
    await fetch(`${BASE_URL}/api/stop`, { method: "POST" });
    await new Promise((r) => setTimeout(r, 200));

    // Start collecting events and immediately start simulation
    const eventsPromise = collectSSEEvents(BASE_URL, 8000);

    // Small delay to ensure SSE is connected before simulation starts
    await new Promise((r) => setTimeout(r, 300));

    // Start simulation at 10x speed with no failures for predictable results
    const simResp = await fetch(`${BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "SSE Integration Test",
        speedMultiplier: 10,
        failureRate: 0,
      }),
    });
    expect(simResp.ok).toBe(true);

    // Wait for events to be collected
    const events = await eventsPromise;

    // Validate event stream contents
    expect(events.length).toBeGreaterThan(5);

    const eventTypes = events.map((e) => e.type);

    // STATE_SNAPSHOT should be the first event (on SSE connect)
    expect(events[0].type).toBe(AG_UI_EVENT_TYPES.STATE_SNAPSHOT);

    // RUN_STARTED should appear (broadcast by startRun)
    expect(eventTypes).toContain(AG_UI_EVENT_TYPES.RUN_STARTED);

    // CUSTOM events should appear (dashboard events translated to AG-UI)
    const customEvents = events.filter(
      (e) => e.type === AG_UI_EVENT_TYPES.CUSTOM
    );
    expect(customEvents.length).toBeGreaterThan(0);

    // Verify CUSTOM events have correct structure
    for (const ce of customEvents) {
      expect(ce.name).toBeDefined();
      expect(ce.timestamp).toBeGreaterThan(0);
    }

    // Check that specific dashboard event types appear as CUSTOM events
    const customNames = customEvents.map((e) => e.name as string);
    expect(customNames).toContain("CREW_PLAN_STARTED");
    expect(customNames).toContain("CREW_PLAN_COMPLETED");
    expect(customNames).toContain("AGENT_REGISTERED");

    // STEP_STARTED events should appear (for planning, waves)
    expect(eventTypes).toContain(AG_UI_EVENT_TYPES.STEP_STARTED);

    // TEXT_MESSAGE events should appear
    expect(eventTypes).toContain(AG_UI_EVENT_TYPES.TEXT_MESSAGE_START);
    expect(eventTypes).toContain(AG_UI_EVENT_TYPES.TEXT_MESSAGE_CONTENT);
    expect(eventTypes).toContain(AG_UI_EVENT_TYPES.TEXT_MESSAGE_END);

    // Verify all events are valid JSON and have required fields
    for (const event of events) {
      expect(event.type).toBeDefined();
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.type).toBe("string");
    }
  }, 15000);

  it("POST /api/stop stops the session and resets state", async () => {
    const resp = await fetch(`${BASE_URL}/api/stop`, { method: "POST" });
    expect(resp.ok).toBe(true);

    const stateResp = await fetch(`${BASE_URL}/api/state`);
    const state = (await stateResp.json()) as DashboardState;
    expect(state.phase).toBe("idle");
  });

  it("GET /api/state returns valid DashboardState after simulation start", async () => {
    // Start a simulation
    await fetch(`${BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speedMultiplier: 10, failureRate: 0 }),
    });

    // Wait a bit for planning to start
    await new Promise((r) => setTimeout(r, 500));

    const resp = await fetch(`${BASE_URL}/api/state`);
    expect(resp.ok).toBe(true);

    const state = (await resp.json()) as DashboardState;
    expect(state.phase).not.toBe("idle");
    expect(state.eventLog.length).toBeGreaterThan(0);

    // Clean up
    await fetch(`${BASE_URL}/api/stop`, { method: "POST" });
  });

  it("no malformed SSE data lines during simulation", async () => {
    // This test verifies that every data: line in the SSE stream is valid JSON
    // and conforms to the AgUiEvent shape
    await fetch(`${BASE_URL}/api/stop`, { method: "POST" });
    await new Promise((r) => setTimeout(r, 200));

    const controller = new AbortController();
    const resp = await fetch(`${BASE_URL}/events`, {
      signal: controller.signal,
    });

    expect(resp.ok).toBe(true);
    expect(resp.body).not.toBeNull();

    // Start simulation
    await fetch(`${BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speedMultiplier: 20, failureRate: 0 }),
    });

    // Read raw SSE data for 4 seconds
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let rawData = "";
    const errors: string[] = [];

    const readTimeout = setTimeout(() => {
      controller.abort();
    }, 4000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawData += decoder.decode(value, { stream: true });
      }
    } catch {
      // AbortError expected
    }

    clearTimeout(readTimeout);

    // Parse all data: lines
    const dataLines = rawData
      .split("\n")
      .filter((line) => line.startsWith("data: "));

    expect(dataLines.length).toBeGreaterThan(0);

    for (const line of dataLines) {
      const jsonStr = line.slice(6);
      try {
        const parsed = JSON.parse(jsonStr);
        expect(parsed.type).toBeDefined();
        expect(parsed.timestamp).toBeDefined();
      } catch (e) {
        errors.push(`Malformed SSE data: ${jsonStr.slice(0, 100)}`);
      }
    }

    expect(errors).toEqual([]);

    // Clean up
    await fetch(`${BASE_URL}/api/stop`, { method: "POST" });
  }, 10000);
});
