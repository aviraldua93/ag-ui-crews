/**
 * Unit tests for the simulator (src/server/simulator.ts)
 * Uses a spy EventEmitter to capture broadcastDashboardEvent calls
 * and verify event ordering, cleanup, and speed control.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startSimulation } from "@server/simulator";
import type { EventEmitter } from "@server/event-emitter";
import type { DashboardEvent, SimulationConfig } from "@shared/types";

// ─── Mock EventEmitter ──────────────────────────────────────────────────────────

interface MockEmitter {
  broadcastDashboardEvent: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
  /** Convenience: all captured DashboardEvent objects */
  events(): DashboardEvent[];
  /** Convenience: event types in order */
  types(): string[];
}

function createMockEmitter(): MockEmitter {
  const calls: DashboardEvent[] = [];
  const broadcastDashboardEvent = vi.fn((event: DashboardEvent) => {
    calls.push(event);
  });
  const broadcast = vi.fn();

  return {
    broadcastDashboardEvent,
    broadcast,
    events: () => [...calls],
    types: () => calls.map((e) => e.type),
  };
}

/** Default fast config for tests */
function fastConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    scenario: "Test scenario",
    speedMultiplier: 100, // 100x speed — timers fire almost instantly
    failureRate: 0,       // disable random failures for deterministic tests
    ...overrides,
  };
}

/**
 * Wait for the simulation to emit a particular event type.
 * Polls the mock emitter with short intervals.
 */
async function waitForEvent(
  mock: MockEmitter,
  type: string,
  timeoutMs = 10_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (mock.types().includes(type)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(
    `Timed out waiting for event "${type}". Received: ${mock.types().join(", ")}`
  );
}

/**
 * Wait until mock emitter has at least `count` events.
 */
async function waitForEventCount(
  mock: MockEmitter,
  count: number,
  timeoutMs = 10_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (mock.events().length >= count) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(
    `Timed out waiting for ${count} events. Got ${mock.events().length}`
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("Simulator", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  // ── Core behavior ──────────────────────────────────────────────────────

  it("startSimulation returns a cleanup function", () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);
    expect(typeof cleanup).toBe("function");
  });

  it("emits CREW_PLAN_STARTED then CREW_PLAN_COMPLETED in order", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);

    await waitForEvent(mock, "CREW_PLAN_COMPLETED");

    const types = mock.types();
    const planStartIdx = types.indexOf("CREW_PLAN_STARTED");
    const planCompleteIdx = types.indexOf("CREW_PLAN_COMPLETED");

    expect(planStartIdx).toBeGreaterThanOrEqual(0);
    expect(planCompleteIdx).toBeGreaterThan(planStartIdx);
  });

  it("registers all 4 agents (architect, backend-dev, frontend-dev, reviewer)", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);

    // Wait for wave 0 to start (agents are registered before waves)
    await waitForEvent(mock, "WAVE_STARTED");

    const registerEvents = mock
      .events()
      .filter((e) => e.type === "AGENT_REGISTERED");

    const names = registerEvents.map((e) => e.data.name as string).sort();
    expect(names).toEqual([
      "architect",
      "backend-dev",
      "frontend-dev",
      "reviewer",
    ]);
  });

  it("executes 4 waves in order", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);

    // Wait for simulation to finish
    await waitForEvent(mock, "METRICS_UPDATE", 12_000);

    const waveStartEvents = mock
      .events()
      .filter((e) => e.type === "WAVE_STARTED")
      .map((e) => e.data.waveIndex as number);

    const waveCompleteEvents = mock
      .events()
      .filter((e) => e.type === "WAVE_COMPLETED")
      .map((e) => e.data.waveIndex as number);

    expect(waveStartEvents).toEqual([0, 1, 2, 3]);
    expect(waveCompleteEvents).toEqual([0, 1, 2, 3]);

    // Verify ordering: each WAVE_STARTED comes before its WAVE_COMPLETED
    const types = mock.types();
    for (let i = 0; i < 4; i++) {
      const startIdx = types.indexOf("WAVE_STARTED");
      const completeIdx = types.indexOf("WAVE_COMPLETED");
      expect(startIdx).toBeLessThan(completeIdx);
    }
  });

  it("produces artifacts for each task", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);

    await waitForEvent(mock, "METRICS_UPDATE", 12_000);

    const artifacts = mock
      .events()
      .filter((e) => e.type === "ARTIFACT_PRODUCED");

    // The simulation has 6 tasks, each producing an artifact
    expect(artifacts.length).toBe(6);

    const taskIds = artifacts.map((e) => e.data.taskId as string).sort();
    expect(taskIds).toEqual([
      "design",
      "implement-api",
      "implement-ui",
      "integrate",
      "review",
      "test",
    ]);

    // Each artifact has a filename and content
    for (const a of artifacts) {
      expect(a.data.filename).toBeTruthy();
      expect(a.data.content).toBeTruthy();
      expect(a.data.producedBy).toBeTruthy();
    }
  });

  it("cleanup stops all timers and prevents further events", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(
      fastConfig({ speedMultiplier: 1 }), // normal speed so simulation is slow
      mock as unknown as EventEmitter
    );

    // Wait for at least one event, then stop
    await waitForEvent(mock, "CREW_PLAN_STARTED");
    const countBefore = mock.events().length;

    cleanup();
    cleanup = null; // prevent double-cleanup in afterEach

    // Wait a bit and verify no more events arrive
    await new Promise((r) => setTimeout(r, 200));
    const countAfter = mock.events().length;

    // After cleanup, event count should not increase significantly
    // (at most 1-2 events might have been in-flight)
    expect(countAfter - countBefore).toBeLessThanOrEqual(2);
  });

  it("speedMultiplier accelerates execution", async () => {
    const mock1 = createMockEmitter();
    const mock100 = createMockEmitter();

    // At 1x speed, start and measure time for first wave start
    const start1 = Date.now();
    const cleanup1 = startSimulation(
      fastConfig({ speedMultiplier: 1 }),
      mock1 as unknown as EventEmitter
    );
    await waitForEvent(mock1, "WAVE_STARTED", 10_000);
    const time1 = Date.now() - start1;
    cleanup1();

    // At 100x speed, same milestone should be much faster
    const start100 = Date.now();
    const cleanup100 = startSimulation(
      fastConfig({ speedMultiplier: 100 }),
      mock100 as unknown as EventEmitter
    );
    await waitForEvent(mock100, "WAVE_STARTED", 10_000);
    const time100 = Date.now() - start100;
    cleanup100();

    // 100x should be significantly faster
    expect(time100).toBeLessThan(time1);
  });

  it("emits complete task lifecycle per task (SUBMITTED → WORKING → COMPLETED)", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);

    await waitForEvent(mock, "METRICS_UPDATE", 12_000);

    // For the deterministic "design" task (wave 0, always succeeds):
    const types = mock.types();
    const events = mock.events();

    // Find events for task "design"
    const designEvents = events.filter(
      (e) =>
        (e.data.taskId === "design" &&
          ["TASK_SUBMITTED", "TASK_WORKING", "TASK_COMPLETED"].includes(e.type))
    );

    expect(designEvents.length).toBeGreaterThanOrEqual(3);

    const designTypes = designEvents.map((e) => e.type);
    const subIdx = designTypes.indexOf("TASK_SUBMITTED");
    const workIdx = designTypes.indexOf("TASK_WORKING");
    const compIdx = designTypes.indexOf("TASK_COMPLETED");

    expect(subIdx).toBeLessThan(workIdx);
    expect(workIdx).toBeLessThan(compIdx);
  });

  it("emits METRICS_UPDATE and STATE_SNAPSHOT at end of simulation", async () => {
    const mock = createMockEmitter();
    cleanup = startSimulation(fastConfig(), mock as unknown as EventEmitter);

    await waitForEvent(mock, "STATE_SNAPSHOT", 12_000);

    const types = mock.types();
    const metricsIdx = types.lastIndexOf("METRICS_UPDATE");
    const snapshotIdx = types.lastIndexOf("STATE_SNAPSHOT");

    expect(metricsIdx).toBeGreaterThanOrEqual(0);
    expect(snapshotIdx).toBeGreaterThan(metricsIdx);
  });
});
