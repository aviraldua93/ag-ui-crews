/**
 * SSE Integration Tests
 *
 * Validates that the EventEmitter correctly:
 * - Sends STATE_SNAPSHOT on client connect
 * - Broadcasts AG-UI events (RUN_STARTED, CUSTOM, etc.) to SSE clients
 * - Translates DashboardEvents → AG-UI events via translateToAgUi
 * - Encodes events in proper SSE format (data: JSON\n\n)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "@server/event-emitter";
import {
  runStarted,
  runFinished,
  runError,
  stateSnapshot,
  customEvent,
  translateToAgUi,
  encodeSSE,
  encodeSSEBatch,
  AG_UI_EVENT_TYPES,
} from "@shared/events";
import type { AgUiEvent } from "@shared/events";
import type { DashboardEvent, DashboardState } from "@shared/types";
import { INITIAL_DASHBOARD_STATE } from "@shared/types";
import {
  createMockSSEController,
  parseSSEEvents,
} from "./helpers";

// ─── EventEmitter SSE Tests ──────────────────────────────────────────────────

describe("EventEmitter — SSE client management", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it("sends STATE_SNAPSHOT to a newly connected client", () => {
    const mock = createMockSSEController();
    emitter.addClient(mock.controller);

    const events = parseSSEEvents(mock.text());
    expect(events.length).toBe(1);

    const snap = events[0] as AgUiEvent;
    expect(snap.type).toBe(AG_UI_EVENT_TYPES.STATE_SNAPSHOT);
    expect(snap.snapshot).toBeDefined();
    // Snapshot should contain the initial dashboard state shape
    const snapshot = snap.snapshot as DashboardState;
    expect(snapshot.phase).toBe("idle");
    expect(snapshot.agents).toEqual([]);
    expect(snapshot.waves).toEqual([]);
    expect(snapshot.tasks).toEqual([]);
  });

  it("tracks client count correctly", () => {
    expect(emitter.clientCount).toBe(0);

    const mock1 = createMockSSEController();
    const mock2 = createMockSSEController();

    emitter.addClient(mock1.controller);
    expect(emitter.clientCount).toBe(1);

    emitter.addClient(mock2.controller);
    expect(emitter.clientCount).toBe(2);

    emitter.removeClient(mock1.controller);
    expect(emitter.clientCount).toBe(1);

    emitter.removeClient(mock2.controller);
    expect(emitter.clientCount).toBe(0);
  });

  it("broadcasts AG-UI events to all connected clients", () => {
    const mock1 = createMockSSEController();
    const mock2 = createMockSSEController();

    emitter.addClient(mock1.controller);
    emitter.addClient(mock2.controller);

    const event = runStarted("thread-1", "run-1");
    emitter.broadcast([event]);

    // Both clients should have: STATE_SNAPSHOT (on connect) + RUN_STARTED
    const events1 = parseSSEEvents(mock1.text());
    const events2 = parseSSEEvents(mock2.text());

    expect(events1.length).toBe(2);
    expect(events2.length).toBe(2);

    expect((events1[0] as AgUiEvent).type).toBe(AG_UI_EVENT_TYPES.STATE_SNAPSHOT);
    expect((events1[1] as AgUiEvent).type).toBe(AG_UI_EVENT_TYPES.RUN_STARTED);
    expect((events1[1] as AgUiEvent).threadId).toBe("thread-1");
    expect((events1[1] as AgUiEvent).runId).toBe("run-1");
  });

  it("removes clients that throw on enqueue", () => {
    const mock = createMockSSEController();
    emitter.addClient(mock.controller);
    expect(emitter.clientCount).toBe(1);

    // Simulate client disconnect
    mock.failOnEnqueue = true;
    emitter.broadcast([runStarted("t", "r")]);

    // Client should have been removed
    expect(emitter.clientCount).toBe(0);
  });

  it("handles client disconnect on addClient gracefully", () => {
    const mock = createMockSSEController();
    mock.failOnEnqueue = true;

    // Should not throw, just silently remove client
    emitter.addClient(mock.controller);
    expect(emitter.clientCount).toBe(0);
  });
});

// ─── EventEmitter State + Dashboard Events ───────────────────────────────────

describe("EventEmitter — broadcastDashboardEvent", () => {
  let emitter: EventEmitter;
  let mock: ReturnType<typeof createMockSSEController>;

  beforeEach(() => {
    emitter = new EventEmitter();
    mock = createMockSSEController();
    emitter.addClient(mock.controller);
  });

  it("emits RUN_STARTED then CUSTOM events wrapping dashboard events", () => {
    // Simulate planning start as a dashboard event
    const dashEvent: DashboardEvent = {
      type: "CREW_PLAN_STARTED",
      timestamp: Date.now(),
      data: { scenario: "Test scenario" },
    };

    emitter.broadcastDashboardEvent(dashEvent);

    const events = parseSSEEvents(mock.text());
    // Events: STATE_SNAPSHOT (connect) + STEP_STARTED + TEXT_MESSAGE triad + CUSTOM
    expect(events.length).toBeGreaterThanOrEqual(2);

    // The last event should be a CUSTOM event wrapping the dashboard event
    const customEvt = events[events.length - 1] as AgUiEvent;
    expect(customEvt.type).toBe(AG_UI_EVENT_TYPES.CUSTOM);
    expect(customEvt.name).toBe("CREW_PLAN_STARTED");
    expect(customEvt.value).toEqual({ scenario: "Test scenario" });
  });

  it("updates internal state and reflects it in getState()", () => {
    emitter.broadcastDashboardEvent({
      type: "CREW_PLAN_STARTED",
      timestamp: Date.now(),
      data: { scenario: "Test" },
    });

    const state = emitter.getState();
    expect(state.phase).toBe("planning");
  });

  it("updates metrics on agent registration", () => {
    emitter.broadcastDashboardEvent({
      type: "AGENT_REGISTERED",
      timestamp: Date.now(),
      data: { name: "architect", role: "System architect" },
    });

    const state = emitter.getState();
    expect(state.agents.length).toBe(1);
    expect(state.agents[0].name).toBe("architect");
    expect(state.agents[0].status).toBe("idle");
    expect(state.metrics.agentCount).toBe(1);
  });

  it("handles full task lifecycle: submitted → working → completed", () => {
    // First set up plan so tasks exist
    emitter.broadcastDashboardEvent({
      type: "CREW_PLAN_COMPLETED",
      timestamp: Date.now(),
      data: {
        plan: {
          scenario: "Test",
          feasibility: { verdict: "go", confidence: 0.9, concerns: [], technical: 0.9, scope: 0.9, risk: 0.1 },
          roles: [{ key: "dev", description: "Developer" }],
          tasks: [{ id: "t1", title: "Task 1", assignedTo: "dev", dependsOn: [] }],
          waves: [[{ id: "t1", title: "Task 1", assignedTo: "dev", dependsOn: [] }]],
        },
        roleCount: 1,
        taskCount: 1,
        waveCount: 1,
      },
    });

    emitter.broadcastDashboardEvent({
      type: "TASK_SUBMITTED",
      timestamp: Date.now(),
      data: { taskId: "t1", title: "Task 1", assignedTo: "dev" },
    });

    let state = emitter.getState();
    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("submitted");

    emitter.broadcastDashboardEvent({
      type: "TASK_WORKING",
      timestamp: Date.now(),
      data: { taskId: "t1", title: "Task 1", assignedTo: "dev" },
    });

    state = emitter.getState();
    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("working");

    emitter.broadcastDashboardEvent({
      type: "TASK_COMPLETED",
      timestamp: Date.now(),
      data: { taskId: "t1", title: "Task 1", assignedTo: "dev", artifact: "t1.md" },
    });

    state = emitter.getState();
    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("completed");
    expect(state.metrics.completedTasks).toBe(1);
  });

  it("handles wave lifecycle: started → completed", () => {
    // Set up plan with waves
    emitter.broadcastDashboardEvent({
      type: "CREW_PLAN_COMPLETED",
      timestamp: Date.now(),
      data: {
        plan: {
          scenario: "Test",
          feasibility: { verdict: "go", confidence: 0.9, concerns: [], technical: 0.9, scope: 0.9, risk: 0.1 },
          roles: [{ key: "dev", description: "Developer" }],
          tasks: [{ id: "t1", title: "Task 1", assignedTo: "dev", dependsOn: [] }],
          waves: [[{ id: "t1", title: "Task 1", assignedTo: "dev", dependsOn: [] }]],
        },
        roleCount: 1,
        taskCount: 1,
        waveCount: 1,
      },
    });

    emitter.broadcastDashboardEvent({
      type: "WAVE_STARTED",
      timestamp: Date.now(),
      data: { waveIndex: 0, taskCount: 1 },
    });

    let state = emitter.getState();
    expect(state.waves[0]?.status).toBe("active");

    emitter.broadcastDashboardEvent({
      type: "WAVE_COMPLETED",
      timestamp: Date.now(),
      data: { waveIndex: 0, tasksCompleted: 1 },
    });

    state = emitter.getState();
    expect(state.waves[0]?.status).toBe("completed");
  });

  it("resets state and sends STATE_SNAPSHOT to clients", () => {
    // Put emitter into non-idle state
    emitter.broadcastDashboardEvent({
      type: "CREW_PLAN_STARTED",
      timestamp: Date.now(),
      data: { scenario: "Test" },
    });

    expect(emitter.getState().phase).toBe("planning");

    emitter.reset();

    const state = emitter.getState();
    expect(state.phase).toBe("idle");
    expect(state.agents).toEqual([]);
    expect(state.tasks).toEqual([]);

    // The reset should have sent a STATE_SNAPSHOT
    const events = parseSSEEvents(mock.text());
    const snapshots = events.filter(
      (e: unknown) => (e as AgUiEvent).type === AG_UI_EVENT_TYPES.STATE_SNAPSHOT
    );
    // At least 2 snapshots: initial connect + reset
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── AG-UI Event Encoding ────────────────────────────────────────────────────

describe("AG-UI event encoding (SSE format)", () => {
  it("encodeSSE produces data: JSON\\n\\n format", () => {
    const event = runStarted("t1", "r1");
    const encoded = encodeSSE(event);

    expect(encoded).toMatch(/^data: \{.*\}\n\n$/);
    const parsed = JSON.parse(encoded.slice(6).trim());
    expect(parsed.type).toBe("RUN_STARTED");
    expect(parsed.threadId).toBe("t1");
    expect(parsed.runId).toBe("r1");
  });

  it("encodeSSEBatch produces multiple data lines", () => {
    const events = [
      runStarted("t1", "r1"),
      runFinished("t1", "r1"),
    ];
    const batch = encodeSSEBatch(events);

    const lines = batch.split("\n\n").filter(Boolean);
    expect(lines.length).toBe(2);

    const parsed = lines.map((l) => JSON.parse(l.replace("data: ", "")));
    expect(parsed[0].type).toBe("RUN_STARTED");
    expect(parsed[1].type).toBe("RUN_FINISHED");
  });
});

// ─── AG-UI Event Factory Functions ───────────────────────────────────────────

describe("AG-UI event factory functions", () => {
  it("runStarted creates correct event", () => {
    const event = runStarted("thread-abc", "run-xyz");
    expect(event.type).toBe("RUN_STARTED");
    expect(event.threadId).toBe("thread-abc");
    expect(event.runId).toBe("run-xyz");
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("runFinished creates correct event", () => {
    const event = runFinished("thread-abc", "run-xyz");
    expect(event.type).toBe("RUN_FINISHED");
    expect(event.threadId).toBe("thread-abc");
    expect(event.runId).toBe("run-xyz");
  });

  it("runError creates correct event", () => {
    const event = runError("Something broke", "ERR_TIMEOUT");
    expect(event.type).toBe("RUN_ERROR");
    expect(event.message).toBe("Something broke");
    expect(event.code).toBe("ERR_TIMEOUT");
  });

  it("stateSnapshot wraps DashboardState", () => {
    const state: DashboardState = { ...INITIAL_DASHBOARD_STATE };
    const event = stateSnapshot(state);
    expect(event.type).toBe("STATE_SNAPSHOT");
    expect(event.snapshot).toBe(state);
    expect((event.snapshot as DashboardState).phase).toBe("idle");
  });

  it("customEvent wraps DashboardEvent", () => {
    const dashEvent: DashboardEvent = {
      type: "TASK_WORKING",
      timestamp: 1000,
      data: { taskId: "t1", title: "Do work" },
    };
    const event = customEvent(dashEvent);
    expect(event.type).toBe("CUSTOM");
    expect(event.name).toBe("TASK_WORKING");
    expect(event.value).toEqual({ taskId: "t1", title: "Do work" });
    expect(event.timestamp).toBe(1000);
  });
});

// ─── translateToAgUi ─────────────────────────────────────────────────────────

describe("translateToAgUi — DashboardEvent → AG-UI events", () => {
  it("CREW_PLAN_STARTED → STEP_STARTED + TEXT_MESSAGE triad + CUSTOM", () => {
    const dashEvent: DashboardEvent = {
      type: "CREW_PLAN_STARTED",
      timestamp: Date.now(),
      data: { scenario: "Test" },
    };

    const events = translateToAgUi(dashEvent);

    const types = events.map((e) => e.type);
    expect(types).toContain("STEP_STARTED");
    expect(types).toContain("TEXT_MESSAGE_START");
    expect(types).toContain("TEXT_MESSAGE_CONTENT");
    expect(types).toContain("TEXT_MESSAGE_END");
    expect(types).toContain("CUSTOM");

    // CUSTOM should always be the last event
    expect(events[events.length - 1].type).toBe("CUSTOM");
    expect(events[events.length - 1].name).toBe("CREW_PLAN_STARTED");
  });

  it("TASK_COMPLETED → TEXT_MESSAGE + CUSTOM", () => {
    const dashEvent: DashboardEvent = {
      type: "TASK_COMPLETED",
      timestamp: Date.now(),
      data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
    };

    const events = translateToAgUi(dashEvent);
    const types = events.map((e) => e.type);
    expect(types).toContain("TEXT_MESSAGE_START");
    expect(types).toContain("TEXT_MESSAGE_CONTENT");
    expect(types).toContain("TEXT_MESSAGE_END");
    expect(types).toContain("CUSTOM");
  });

  it("always includes CUSTOM event as the last event", () => {
    const testEvents: DashboardEvent[] = [
      { type: "WAVE_STARTED", timestamp: Date.now(), data: { waveIndex: 0, taskCount: 2 } },
      { type: "AGENT_REGISTERED", timestamp: Date.now(), data: { name: "arch" } },
      { type: "TASK_FAILED", timestamp: Date.now(), data: { taskId: "t1", title: "X", assignedTo: "d" } },
      { type: "ARTIFACT_PRODUCED", timestamp: Date.now(), data: { filename: "f.md", producedBy: "d" } },
    ];

    for (const event of testEvents) {
      const agUiEvents = translateToAgUi(event);
      expect(agUiEvents.length).toBeGreaterThanOrEqual(1);
      expect(agUiEvents[agUiEvents.length - 1].type).toBe("CUSTOM");
      expect(agUiEvents[agUiEvents.length - 1].name).toBe(event.type);
    }
  });

  it("WAVE_STARTED → STEP_STARTED + TEXT_MESSAGE + CUSTOM", () => {
    const dashEvent: DashboardEvent = {
      type: "WAVE_STARTED",
      timestamp: Date.now(),
      data: { waveIndex: 1, taskCount: 3 },
    };

    const events = translateToAgUi(dashEvent);
    const types = events.map((e) => e.type);
    expect(types).toContain("STEP_STARTED");
    expect(types).toContain("CUSTOM");
  });

  it("WAVE_COMPLETED → STEP_FINISHED + CUSTOM", () => {
    const dashEvent: DashboardEvent = {
      type: "WAVE_COMPLETED",
      timestamp: Date.now(),
      data: { waveIndex: 0, tasksCompleted: 2 },
    };

    const events = translateToAgUi(dashEvent);
    const types = events.map((e) => e.type);
    expect(types).toContain("STEP_FINISHED");
    expect(types).toContain("CUSTOM");
  });

  it("unknown event types still produce a CUSTOM event", () => {
    const dashEvent: DashboardEvent = {
      type: "METRICS_UPDATE" as any,
      timestamp: Date.now(),
      data: { totalTime: 5000 },
    };

    const events = translateToAgUi(dashEvent);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("CUSTOM");
    expect(events[0].name).toBe("METRICS_UPDATE");
  });
});
