/**
 * Unit tests for EventEmitter (src/server/event-emitter.ts)
 * Covers: addClient, removeClient, broadcast, broadcastDashboardEvent,
 *         getState, reset, clientCount, and the full state reducer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "@server/event-emitter";
import {
  createMockSSEController,
  parseSSEEvents,
  type MockSSEController,
} from "./helpers";
import type {
  DashboardEvent,
  DashboardState,
  CrewPlan,
} from "@shared/types";

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Build a minimal CrewPlan for tests */
function makePlan(): CrewPlan {
  return {
    scenario: "test scenario",
    feasibility: {
      verdict: "go",
      confidence: 0.9,
      concerns: [],
      technical: 0.9,
      scope: 0.9,
      risk: 0.1,
    },
    roles: [
      { key: "dev", description: "Developer" },
      { key: "reviewer", description: "Reviewer" },
    ],
    tasks: [
      { id: "t1", title: "Task 1", assignedTo: "dev", dependsOn: [] },
      { id: "t2", title: "Task 2", assignedTo: "reviewer", dependsOn: ["t1"] },
    ],
    waves: [
      [{ id: "t1", title: "Task 1", assignedTo: "dev", dependsOn: [] }],
      [{ id: "t2", title: "Task 2", assignedTo: "reviewer", dependsOn: ["t1"] }],
    ],
  };
}

function makeDashboardEvent(
  type: DashboardEvent["type"],
  data: Record<string, unknown> = {}
): DashboardEvent {
  return { type, timestamp: Date.now(), data };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("EventEmitter", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  // ── addClient / removeClient / clientCount ──────────────────────────────

  describe("addClient", () => {
    it("sends a STATE_SNAPSHOT on connect", () => {
      const mock = createMockSSEController();
      emitter.addClient(mock.controller);

      const events = parseSSEEvents(mock.text());
      expect(events.length).toBe(1);
      expect((events[0] as any).type).toBe("STATE_SNAPSHOT");
      expect((events[0] as any).snapshot).toBeDefined();
    });

    it("increments clientCount", () => {
      expect(emitter.clientCount).toBe(0);
      const m1 = createMockSSEController();
      emitter.addClient(m1.controller);
      expect(emitter.clientCount).toBe(1);
      const m2 = createMockSSEController();
      emitter.addClient(m2.controller);
      expect(emitter.clientCount).toBe(2);
    });

    it("removes client if enqueue throws on connect", () => {
      const mock = createMockSSEController();
      mock.failOnEnqueue = true;
      emitter.addClient(mock.controller);
      expect(emitter.clientCount).toBe(0);
    });
  });

  describe("removeClient", () => {
    it("decrements clientCount", () => {
      const mock = createMockSSEController();
      emitter.addClient(mock.controller);
      expect(emitter.clientCount).toBe(1);
      emitter.removeClient(mock.controller);
      expect(emitter.clientCount).toBe(0);
    });

    it("is idempotent for unknown controllers", () => {
      const mock = createMockSSEController();
      emitter.removeClient(mock.controller); // no-op
      expect(emitter.clientCount).toBe(0);
    });
  });

  // ── broadcast ───────────────────────────────────────────────────────────

  describe("broadcast", () => {
    it("sends AG-UI events to all connected clients", () => {
      const m1 = createMockSSEController();
      const m2 = createMockSSEController();
      emitter.addClient(m1.controller);
      emitter.addClient(m2.controller);

      // Clear snapshot events
      m1.chunks.length = 0;
      m2.chunks.length = 0;

      emitter.broadcast([
        { type: "CUSTOM", timestamp: Date.now(), name: "test" },
      ]);

      const e1 = parseSSEEvents(m1.text());
      const e2 = parseSSEEvents(m2.text());
      expect(e1.length).toBe(1);
      expect(e2.length).toBe(1);
      expect((e1[0] as any).type).toBe("CUSTOM");
      expect((e2[0] as any).type).toBe("CUSTOM");
    });

    it("removes clients that throw on enqueue", () => {
      const good = createMockSSEController();
      const bad = createMockSSEController();
      emitter.addClient(good.controller);
      emitter.addClient(bad.controller);
      expect(emitter.clientCount).toBe(2);

      // Make bad client fail
      bad.failOnEnqueue = true;

      emitter.broadcast([
        { type: "CUSTOM", timestamp: Date.now(), name: "x" },
      ]);

      expect(emitter.clientCount).toBe(1);
    });

    it("does nothing for empty event array", () => {
      const mock = createMockSSEController();
      emitter.addClient(mock.controller);
      mock.chunks.length = 0;
      emitter.broadcast([]);
      expect(mock.chunks.length).toBe(0);
    });
  });

  // ── broadcastDashboardEvent ─────────────────────────────────────────────

  describe("broadcastDashboardEvent", () => {
    it("applies event to state and broadcasts AG-UI events", () => {
      const mock = createMockSSEController();
      emitter.addClient(mock.controller);
      mock.chunks.length = 0;

      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_STARTED", { scenario: "test" })
      );

      // State should be updated
      expect(emitter.getState().phase).toBe("planning");

      // Should have broadcast AG-UI events
      const events = parseSSEEvents(mock.text());
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ── getState ────────────────────────────────────────────────────────────

  describe("getState", () => {
    it("returns a deep clone (mutations do not affect internal state)", () => {
      const state1 = emitter.getState();
      state1.phase = "completed";
      state1.agents.push({
        name: "rogue",
        role: "hacker",
        status: "idle",
        retryCount: 0,
      });

      const state2 = emitter.getState();
      expect(state2.phase).toBe("idle");
      expect(state2.agents.length).toBe(0);
    });
  });

  // ── reset ───────────────────────────────────────────────────────────────

  describe("reset", () => {
    it("resets state to initial and sends STATE_SNAPSHOT to clients", () => {
      const mock = createMockSSEController();
      emitter.addClient(mock.controller);

      // Modify state
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_STARTED", { scenario: "test" })
      );
      expect(emitter.getState().phase).toBe("planning");

      mock.chunks.length = 0;
      emitter.reset();

      expect(emitter.getState().phase).toBe("idle");

      // Should have sent a STATE_SNAPSHOT
      const events = parseSSEEvents(mock.text());
      const snaps = events.filter((e: any) => e.type === "STATE_SNAPSHOT");
      expect(snaps.length).toBe(1);
    });
  });

  // ── State Reducer ───────────────────────────────────────────────────────

  describe("State Reducer", () => {
    it("CREW_PLAN_COMPLETED initializes waves and tasks", () => {
      const plan = makePlan();
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_COMPLETED", {
          plan,
          roleCount: 2,
          taskCount: 2,
          waveCount: 2,
        })
      );

      const state = emitter.getState();
      expect(state.phase).toBe("executing");
      expect(state.waves.length).toBe(2);
      expect(state.tasks.length).toBe(2);
      expect(state.metrics.taskCount).toBe(2);
      expect(state.metrics.waveCount).toBe(2);
      expect(state.waves[0].tasks[0].id).toBe("t1");
      expect(state.waves[1].tasks[0].id).toBe("t2");
    });

    it("AGENT_REGISTERED adds agent to state", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", {
          name: "alpha",
          role: "Developer",
        })
      );

      const state = emitter.getState();
      expect(state.agents.length).toBe(1);
      expect(state.agents[0].name).toBe("alpha");
      expect(state.agents[0].status).toBe("idle");
      expect(state.metrics.agentCount).toBe(1);
    });

    it("AGENT_REGISTERED does not duplicate agents", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "alpha", role: "Dev" })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "alpha", role: "Dev" })
      );

      expect(emitter.getState().agents.length).toBe(1);
    });

    it("AGENT_ACTIVE sets agent status and currentTask", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "beta", role: "QA" })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_ACTIVE", { name: "beta", taskId: "t1" })
      );

      const agent = emitter.getState().agents[0];
      expect(agent.status).toBe("active");
      expect(agent.currentTask).toBe("t1");
      expect(agent.startedAt).toBeDefined();
    });

    it("AGENT_COMPLETED transitions agent to completed", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "gamma", role: "Dev" })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_COMPLETED", { name: "gamma" })
      );

      const agent = emitter.getState().agents[0];
      expect(agent.status).toBe("completed");
      expect(agent.completedAt).toBeDefined();
      expect(agent.currentTask).toBeUndefined();
    });

    it("AGENT_FAILED transitions agent to failed", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "delta", role: "Dev" })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_FAILED", { name: "delta" })
      );

      expect(emitter.getState().agents[0].status).toBe("failed");
    });

    it("AGENT_RETRYING transitions agent and increments retryCount", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "epsilon", role: "Dev" })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_RETRYING", { name: "epsilon" })
      );

      const agent = emitter.getState().agents[0];
      expect(agent.status).toBe("retrying");
      expect(agent.retryCount).toBe(1);
    });

    it("TASK lifecycle: SUBMITTED → WORKING → COMPLETED", () => {
      // First, set up plan so tasks exist
      const plan = makePlan();
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_COMPLETED", { plan })
      );

      // TASK_SUBMITTED
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("TASK_SUBMITTED", { taskId: "t1" })
      );
      expect(emitter.getState().tasks.find((t) => t.id === "t1")?.status).toBe(
        "submitted"
      );

      // TASK_WORKING
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("TASK_WORKING", { taskId: "t1" })
      );
      const workingTask = emitter.getState().tasks.find((t) => t.id === "t1");
      expect(workingTask?.status).toBe("working");
      expect(workingTask?.startedAt).toBeDefined();

      // TASK_COMPLETED
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("TASK_COMPLETED", {
          taskId: "t1",
          artifact: "output.md",
        })
      );
      const completedTask = emitter.getState().tasks.find((t) => t.id === "t1");
      expect(completedTask?.status).toBe("completed");
      expect(completedTask?.completedAt).toBeDefined();
      expect(completedTask?.artifact).toBe("output.md");
      expect(emitter.getState().metrics.completedTasks).toBe(1);
    });

    it("TASK_FAILED increments failedTasks metric", () => {
      const plan = makePlan();
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_COMPLETED", { plan })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("TASK_FAILED", { taskId: "t1" })
      );

      const task = emitter.getState().tasks.find((t) => t.id === "t1");
      expect(task?.status).toBe("failed");
      expect(emitter.getState().metrics.failedTasks).toBe(1);
    });

    it("TASK_RETRYING resets task to submitted and increments retry metrics", () => {
      const plan = makePlan();
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_COMPLETED", { plan })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("TASK_RETRYING", { taskId: "t1" })
      );

      const task = emitter.getState().tasks.find((t) => t.id === "t1");
      expect(task?.status).toBe("submitted");
      expect(task?.retryCount).toBe(1);
      expect(emitter.getState().metrics.retryCount).toBe(1);
    });

    it("WAVE_STARTED and WAVE_COMPLETED update wave status", () => {
      const plan = makePlan();
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_COMPLETED", { plan })
      );

      emitter.broadcastDashboardEvent(
        makeDashboardEvent("WAVE_STARTED", { waveIndex: 0 })
      );
      expect(emitter.getState().waves[0].status).toBe("active");
      expect(emitter.getState().waves[0].startedAt).toBeDefined();

      emitter.broadcastDashboardEvent(
        makeDashboardEvent("WAVE_COMPLETED", { waveIndex: 0 })
      );
      expect(emitter.getState().waves[0].status).toBe("completed");
      expect(emitter.getState().waves[0].completedAt).toBeDefined();
    });

    it("ARTIFACT_PRODUCED adds artifact to state", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("ARTIFACT_PRODUCED", {
          taskId: "t1",
          filename: "design.md",
          content: "# Design doc",
          producedBy: "architect",
        })
      );

      const artifacts = emitter.getState().artifacts;
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].taskId).toBe("t1");
      expect(artifacts[0].filename).toBe("design.md");
      expect(artifacts[0].content).toBe("# Design doc");
      expect(artifacts[0].producedBy).toBe("architect");
      expect(artifacts[0].producedAt).toBeDefined();
    });

    it("METRICS_UPDATE patches metrics selectively", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("METRICS_UPDATE", {
          totalTime: 5000,
          completedTasks: 3,
        })
      );

      const metrics = emitter.getState().metrics;
      expect(metrics.totalTime).toBe(5000);
      expect(metrics.completedTasks).toBe(3);
      // Other metrics remain unchanged
      expect(metrics.failedTasks).toBe(0);
    });

    it("CREW_PLAN_STARTED sets phase to planning", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_STARTED", { scenario: "test" })
      );
      expect(emitter.getState().phase).toBe("planning");
      expect(emitter.getState().startedAt).toBeDefined();
    });

    it("CREW_PLAN_FAILED sets phase to error", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_FAILED", { error: "timeout" })
      );
      expect(emitter.getState().phase).toBe("error");
      expect(emitter.getState().error).toBe("timeout");
    });

    it("WAVE_FAILED transitions wave to failed", () => {
      const plan = makePlan();
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_COMPLETED", { plan })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("WAVE_FAILED", { waveIndex: 0 })
      );
      expect(emitter.getState().waves[0].status).toBe("failed");
    });

    it("BRIDGE_CONNECTED and BRIDGE_DISCONNECTED update phase and bridgeUrl", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("BRIDGE_CONNECTED", { url: "http://localhost:8080" })
      );
      let state = emitter.getState();
      expect(state.phase).toBe("connecting");
      expect(state.bridgeUrl).toBe("http://localhost:8080");

      emitter.broadcastDashboardEvent(
        makeDashboardEvent("BRIDGE_DISCONNECTED", {})
      );
      state = emitter.getState();
      expect(state.phase).toBe("idle");
      expect(state.bridgeUrl).toBeNull();
    });

    it("all events are logged in eventLog", () => {
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("CREW_PLAN_STARTED", { scenario: "test" })
      );
      emitter.broadcastDashboardEvent(
        makeDashboardEvent("AGENT_REGISTERED", { name: "a1", role: "Dev" })
      );

      const log = emitter.getState().eventLog;
      expect(log.length).toBe(2);
      expect(log[0].type).toBe("CREW_PLAN_STARTED");
      expect(log[1].type).toBe("AGENT_REGISTERED");
    });
  });
});
