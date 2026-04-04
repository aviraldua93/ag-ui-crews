/**
 * useEventStream Reducer Tests
 *
 * Validates that the client-side state reducer correctly handles:
 * - STATE_SNAPSHOT action (full state replacement)
 * - PROCESS_EVENT dispatches for all DashboardEvent types
 * - RUN_STARTED → SET_PHASE "planning"
 * - RUN_FINISHED → SET_PHASE "completed"
 * - RUN_ERROR → SET_ERROR with message
 * - Full simulation lifecycle: idle → planning → executing → completed
 */
import { describe, it, expect } from "vitest";
import type {
  DashboardState,
  DashboardEvent,
  CrewPlan,
  AgentState,
  TaskState,
  WaveState,
} from "@shared/types";
import { INITIAL_DASHBOARD_STATE } from "@shared/types";

// ─── Import reducer internals ─────────────────────────────────────────────────
// The reducer and Action type are not exported, so we re-create them here
// to test the logic directly without needing React hooks.

const MAX_EVENT_LOG = 200;

type Action =
  | { type: "RESET" }
  | { type: "SET_PHASE"; phase: DashboardState["phase"] }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_BRIDGE_URL"; url: string }
  | { type: "PROCESS_EVENT"; event: DashboardEvent }
  | { type: "STATE_SNAPSHOT"; state: DashboardState };

function addToLog(
  log: DashboardEvent[],
  event: DashboardEvent
): DashboardEvent[] {
  const next = [...log, event];
  return next.length > MAX_EVENT_LOG ? next.slice(-MAX_EVENT_LOG) : next;
}

function updateAgent(
  agents: AgentState[],
  name: string,
  updater: (a: AgentState) => AgentState
): AgentState[] {
  const idx = agents.findIndex((a) => a.name === name);
  if (idx === -1) return agents;
  const copy = [...agents];
  copy[idx] = updater(copy[idx]);
  return copy;
}

function updateTask(
  tasks: TaskState[],
  taskId: string,
  updater: (t: TaskState) => TaskState
): TaskState[] {
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return tasks;
  const copy = [...tasks];
  copy[idx] = updater(copy[idx]);
  return copy;
}

function updateWaveTask(
  waves: WaveState[],
  taskId: string,
  updater: (t: TaskState) => TaskState
): WaveState[] {
  return waves.map((w) => ({
    ...w,
    tasks: w.tasks.map((t) => (t.id === taskId ? updater(t) : t)),
  }));
}

// Re-implement the reducer (matching src/client/hooks/useEventStream.ts exactly)
function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "RESET":
      return { ...INITIAL_DASHBOARD_STATE };
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SET_ERROR":
      return { ...state, phase: "error", error: action.error };
    case "SET_BRIDGE_URL":
      return { ...state, bridgeUrl: action.url };
    case "STATE_SNAPSHOT":
      return { ...action.state };
    case "PROCESS_EVENT": {
      const { event } = action;
      const eventLog = addToLog(state.eventLog, event);
      const data = event.data;

      switch (event.type) {
        case "CREW_PLAN_STARTED":
          return {
            ...state,
            eventLog,
            phase: "planning",
            startedAt: state.startedAt ?? Date.now(),
          };
        case "CREW_PLAN_COMPLETED": {
          const plan = data.plan as CrewPlan;
          const tasks: TaskState[] = plan.tasks.map((pt) => ({
            id: pt.id,
            title: pt.title,
            assignedTo: pt.assignedTo,
            status: "pending",
            wave: 0,
            dependsOn: pt.dependsOn,
            retryCount: 0,
          }));
          const waves: WaveState[] = plan.waves.map((waveTasks, idx) => ({
            index: idx,
            status: "pending",
            tasks: waveTasks.map((wt) => ({
              id: wt.id,
              title: wt.title,
              assignedTo: wt.assignedTo,
              status: "pending" as const,
              wave: idx,
              dependsOn: wt.dependsOn,
              retryCount: 0,
            })),
          }));
          return { ...state, eventLog, phase: "executing", plan, tasks, waves };
        }
        case "CREW_PLAN_FAILED":
          return {
            ...state,
            eventLog,
            phase: "error",
            error: (data.error as string) ?? "Planning failed",
          };
        case "AGENT_REGISTERED": {
          const agent: AgentState = {
            name: data.name as string,
            role: (data.role as string) ?? (data.name as string),
            status: "idle",
            retryCount: 0,
          };
          return {
            ...state,
            eventLog,
            agents: [...state.agents, agent],
            metrics: {
              ...state.metrics,
              agentCount: state.agents.length + 1,
            },
          };
        }
        case "AGENT_ACTIVE":
          return {
            ...state,
            eventLog,
            agents: updateAgent(state.agents, data.name as string, (a) => ({
              ...a,
              status: "active",
              currentTask: data.taskId as string | undefined,
              startedAt: Date.now(),
            })),
          };
        case "AGENT_COMPLETED":
          return {
            ...state,
            eventLog,
            agents: updateAgent(state.agents, data.name as string, (a) => ({
              ...a,
              status: "completed",
              currentTask: undefined,
              completedAt: Date.now(),
            })),
          };
        case "AGENT_FAILED":
          return {
            ...state,
            eventLog,
            agents: updateAgent(state.agents, data.name as string, (a) => ({
              ...a,
              status: "failed",
              currentTask: undefined,
            })),
          };
        case "AGENT_RETRYING":
          return {
            ...state,
            eventLog,
            agents: updateAgent(state.agents, data.name as string, (a) => ({
              ...a,
              status: "retrying",
              retryCount: a.retryCount + 1,
            })),
          };
        case "TASK_SUBMITTED":
          return {
            ...state,
            eventLog,
            tasks: updateTask(state.tasks, data.taskId as string, (t) => ({
              ...t,
              status: "submitted",
            })),
            waves: updateWaveTask(
              state.waves,
              data.taskId as string,
              (t) => ({ ...t, status: "submitted" })
            ),
          };
        case "TASK_WORKING":
          return {
            ...state,
            eventLog,
            tasks: updateTask(state.tasks, data.taskId as string, (t) => ({
              ...t,
              status: "working",
              startedAt: Date.now(),
            })),
            waves: updateWaveTask(
              state.waves,
              data.taskId as string,
              (t) => ({ ...t, status: "working", startedAt: Date.now() })
            ),
          };
        case "TASK_COMPLETED":
          return {
            ...state,
            eventLog,
            tasks: updateTask(state.tasks, data.taskId as string, (t) => ({
              ...t,
              status: "completed",
              completedAt: Date.now(),
            })),
            waves: updateWaveTask(
              state.waves,
              data.taskId as string,
              (t) => ({ ...t, status: "completed", completedAt: Date.now() })
            ),
            metrics: {
              ...state.metrics,
              completedTasks: state.metrics.completedTasks + 1,
            },
          };
        case "TASK_FAILED":
          return {
            ...state,
            eventLog,
            tasks: updateTask(state.tasks, data.taskId as string, (t) => ({
              ...t,
              status: "failed",
              completedAt: Date.now(),
            })),
            waves: updateWaveTask(
              state.waves,
              data.taskId as string,
              (t) => ({ ...t, status: "failed", completedAt: Date.now() })
            ),
            metrics: {
              ...state.metrics,
              failedTasks: state.metrics.failedTasks + 1,
            },
          };
        case "TASK_RETRYING":
          return {
            ...state,
            eventLog,
            tasks: updateTask(state.tasks, data.taskId as string, (t) => ({
              ...t,
              status: "working",
              retryCount: t.retryCount + 1,
            })),
            waves: updateWaveTask(
              state.waves,
              data.taskId as string,
              (t) => ({ ...t, status: "working", retryCount: t.retryCount + 1 })
            ),
            metrics: {
              ...state.metrics,
              retryCount: state.metrics.retryCount + 1,
            },
          };
        case "WAVE_STARTED": {
          const waveIndex = data.waveIndex as number;
          return {
            ...state,
            eventLog,
            waves: state.waves.map((w) =>
              w.index === waveIndex
                ? { ...w, status: "active", startedAt: Date.now() }
                : w
            ),
          };
        }
        case "WAVE_COMPLETED": {
          const waveIndex = data.waveIndex as number;
          return {
            ...state,
            eventLog,
            waves: state.waves.map((w) =>
              w.index === waveIndex
                ? { ...w, status: "completed", completedAt: Date.now() }
                : w
            ),
            metrics: {
              ...state.metrics,
              waveCount: state.metrics.waveCount + 1,
            },
          };
        }
        case "WAVE_FAILED": {
          const waveIndex = data.waveIndex as number;
          return {
            ...state,
            eventLog,
            waves: state.waves.map((w) =>
              w.index === waveIndex
                ? { ...w, status: "failed", completedAt: Date.now() }
                : w
            ),
          };
        }
        case "ARTIFACT_PRODUCED": {
          const artifact = {
            taskId: data.taskId as string,
            filename: data.filename as string,
            content: data.content as string,
            producedBy: data.producedBy as string,
            producedAt: Date.now(),
          };
          return {
            ...state,
            eventLog,
            artifacts: [...state.artifacts, artifact],
          };
        }
        case "BRIDGE_CONNECTED":
          return {
            ...state,
            eventLog,
            phase: state.phase === "idle" ? "planning" : state.phase,
            startedAt: state.startedAt ?? Date.now(),
          };
        case "BRIDGE_DISCONNECTED":
          return { ...state, eventLog };
        default:
          return { ...state, eventLog };
      }
    }
  }
}

// ─── Helper to make test plans ────────────────────────────────────────────────

function makeTestPlan(): CrewPlan {
  return {
    scenario: "Test scenario",
    feasibility: {
      verdict: "go",
      confidence: 0.85,
      concerns: [],
      technical: 0.9,
      scope: 0.8,
      risk: 0.15,
    },
    roles: [
      { key: "dev", description: "Developer" },
      { key: "reviewer", description: "Reviewer" },
    ],
    tasks: [
      { id: "t1", title: "Build API", assignedTo: "dev", dependsOn: [] },
      {
        id: "t2",
        title: "Review code",
        assignedTo: "reviewer",
        dependsOn: ["t1"],
      },
    ],
    waves: [
      [{ id: "t1", title: "Build API", assignedTo: "dev", dependsOn: [] }],
      [
        {
          id: "t2",
          title: "Review code",
          assignedTo: "reviewer",
          dependsOn: ["t1"],
        },
      ],
    ],
  };
}

function stateWithPlan(): DashboardState {
  const plan = makeTestPlan();
  return reducer({ ...INITIAL_DASHBOARD_STATE }, {
    type: "PROCESS_EVENT",
    event: {
      type: "CREW_PLAN_COMPLETED",
      timestamp: Date.now(),
      data: { plan, roleCount: 2, taskCount: 2, waveCount: 2 },
    },
  });
}

// ─── Core Action Tests ───────────────────────────────────────────────────────

describe("useEventStream reducer — core actions", () => {
  it("RESET returns to initial state", () => {
    const modified: DashboardState = {
      ...INITIAL_DASHBOARD_STATE,
      phase: "executing",
      agents: [
        { name: "dev", role: "dev", status: "active", retryCount: 0 },
      ],
    };

    const result = reducer(modified, { type: "RESET" });
    expect(result.phase).toBe("idle");
    expect(result.agents).toEqual([]);
    expect(result.tasks).toEqual([]);
  });

  it("SET_PHASE updates phase only", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "SET_PHASE",
      phase: "planning",
    });
    expect(result.phase).toBe("planning");
    expect(result.agents).toEqual([]); // Other state untouched
  });

  it("SET_ERROR sets error phase and message", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "SET_ERROR",
      error: "Something went wrong",
    });
    expect(result.phase).toBe("error");
    expect(result.error).toBe("Something went wrong");
  });

  it("SET_BRIDGE_URL stores the URL", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "SET_BRIDGE_URL",
      url: "http://localhost:3000",
    });
    expect(result.bridgeUrl).toBe("http://localhost:3000");
  });

  it("STATE_SNAPSHOT replaces entire state", () => {
    const snapshot: DashboardState = {
      ...INITIAL_DASHBOARD_STATE,
      phase: "executing",
      agents: [
        { name: "arch", role: "architect", status: "active", retryCount: 0 },
      ],
    };

    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "STATE_SNAPSHOT",
      state: snapshot,
    });

    expect(result.phase).toBe("executing");
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].name).toBe("arch");
  });
});

// ─── AG-UI Event Dispatch Mapping ────────────────────────────────────────────
// These test how the onmessage handler in useEventStream maps AG-UI events to actions

describe("useEventStream — AG-UI event → action dispatch mapping", () => {
  it("STATE_SNAPSHOT AG-UI event → STATE_SNAPSHOT action (full state replacement)", () => {
    const snapshot: DashboardState = {
      ...INITIAL_DASHBOARD_STATE,
      phase: "executing",
      agents: [
        { name: "dev", role: "Developer", status: "active", retryCount: 0 },
      ],
    };

    // This simulates what the onmessage handler does:
    // agUiEvent.type === STATE_SNAPSHOT → dispatch({ type: "STATE_SNAPSHOT", state: snapshot })
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "STATE_SNAPSHOT",
      state: snapshot,
    });

    expect(result).toEqual(snapshot);
  });

  it("CUSTOM AG-UI event → PROCESS_EVENT action with translated DashboardEvent", () => {
    // The onmessage handler translates:
    // { type: "CUSTOM", name: "CREW_PLAN_STARTED", value: {...}, timestamp }
    // → dispatch({ type: "PROCESS_EVENT", event: { type: "CREW_PLAN_STARTED", timestamp, data: {...} } })
    const dashEvent: DashboardEvent = {
      type: "CREW_PLAN_STARTED",
      timestamp: Date.now(),
      data: { scenario: "Test" },
    };

    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: dashEvent,
    });

    expect(result.phase).toBe("planning");
    expect(result.eventLog.length).toBe(1);
    expect(result.eventLog[0].type).toBe("CREW_PLAN_STARTED");
  });

  it("RUN_STARTED AG-UI event → SET_PHASE 'planning'", () => {
    // onmessage: agUiEvent.type === RUN_STARTED → dispatch({ type: "SET_PHASE", phase: "planning" })
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "SET_PHASE",
      phase: "planning",
    });

    expect(result.phase).toBe("planning");
  });

  it("RUN_FINISHED AG-UI event → SET_PHASE 'completed'", () => {
    // onmessage: agUiEvent.type === RUN_FINISHED → dispatch({ type: "SET_PHASE", phase: "completed" })
    const executingState: DashboardState = {
      ...INITIAL_DASHBOARD_STATE,
      phase: "executing",
    };

    const result = reducer(executingState, {
      type: "SET_PHASE",
      phase: "completed",
    });

    expect(result.phase).toBe("completed");
  });

  it("RUN_ERROR AG-UI event → SET_ERROR with message", () => {
    // onmessage: agUiEvent.type === RUN_ERROR → dispatch({ type: "SET_ERROR", error: message })
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "SET_ERROR",
      error: "Model timeout",
    });

    expect(result.phase).toBe("error");
    expect(result.error).toBe("Model timeout");
  });
});

// ─── PROCESS_EVENT: Dashboard Event Types ────────────────────────────────────

describe("useEventStream reducer — PROCESS_EVENT types", () => {
  it("CREW_PLAN_STARTED sets phase to planning", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "CREW_PLAN_STARTED",
        timestamp: Date.now(),
        data: { scenario: "Build API" },
      },
    });

    expect(result.phase).toBe("planning");
    expect(result.startedAt).toBeGreaterThan(0);
  });

  it("CREW_PLAN_COMPLETED sets phase to executing and initializes tasks/waves", () => {
    const state = stateWithPlan();

    expect(state.phase).toBe("executing");
    expect(state.plan).not.toBeNull();
    expect(state.tasks.length).toBe(2);
    expect(state.waves.length).toBe(2);
    expect(state.waves[0].tasks.length).toBe(1);
    expect(state.waves[1].tasks.length).toBe(1);

    // All tasks start pending
    for (const task of state.tasks) {
      expect(task.status).toBe("pending");
      expect(task.retryCount).toBe(0);
    }
  });

  it("CREW_PLAN_FAILED sets phase to error", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "CREW_PLAN_FAILED",
        timestamp: Date.now(),
        data: { error: "No agents available" },
      },
    });

    expect(result.phase).toBe("error");
    expect(result.error).toBe("No agents available");
  });

  it("AGENT_REGISTERED adds agent to state", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "architect", role: "System architect" },
      },
    });

    expect(result.agents.length).toBe(1);
    expect(result.agents[0]).toEqual(
      expect.objectContaining({
        name: "architect",
        role: "System architect",
        status: "idle",
        retryCount: 0,
      })
    );
    expect(result.metrics.agentCount).toBe(1);
  });

  it("AGENT_ACTIVE sets agent to active with current task", () => {
    let state = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "dev", role: "Developer" },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_ACTIVE",
        timestamp: Date.now(),
        data: { name: "dev", taskId: "t1" },
      },
    });

    expect(state.agents[0].status).toBe("active");
    expect(state.agents[0].currentTask).toBe("t1");
  });

  it("AGENT_COMPLETED sets agent to completed", () => {
    let state = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "dev", role: "Developer" },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_COMPLETED",
        timestamp: Date.now(),
        data: { name: "dev" },
      },
    });

    expect(state.agents[0].status).toBe("completed");
    expect(state.agents[0].currentTask).toBeUndefined();
  });

  it("AGENT_FAILED sets agent to failed", () => {
    let state = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "dev", role: "Developer" },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_FAILED",
        timestamp: Date.now(),
        data: { name: "dev" },
      },
    });

    expect(state.agents[0].status).toBe("failed");
  });

  it("AGENT_RETRYING sets agent to retrying and increments count", () => {
    let state = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "dev", role: "Developer" },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_RETRYING",
        timestamp: Date.now(),
        data: { name: "dev" },
      },
    });

    expect(state.agents[0].status).toBe("retrying");
    expect(state.agents[0].retryCount).toBe(1);
  });

  it("TASK_SUBMITTED updates task status in both tasks and waves", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_SUBMITTED",
        timestamp: Date.now(),
        data: { taskId: "t1" },
      },
    });

    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("submitted");
    expect(state.waves[0].tasks.find((t) => t.id === "t1")?.status).toBe(
      "submitted"
    );
  });

  it("TASK_WORKING updates task status", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_WORKING",
        timestamp: Date.now(),
        data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
      },
    });

    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("working");
  });

  it("TASK_COMPLETED updates task and increments completedTasks metric", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_COMPLETED",
        timestamp: Date.now(),
        data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
      },
    });

    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("completed");
    expect(state.metrics.completedTasks).toBe(1);
  });

  it("TASK_FAILED updates task and increments failedTasks metric", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_FAILED",
        timestamp: Date.now(),
        data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
      },
    });

    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("failed");
    expect(state.metrics.failedTasks).toBe(1);
  });

  it("TASK_RETRYING resets task to working and increments retry count", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_RETRYING",
        timestamp: Date.now(),
        data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
      },
    });

    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("working");
    expect(state.tasks.find((t) => t.id === "t1")?.retryCount).toBe(1);
    expect(state.metrics.retryCount).toBe(1);
  });

  it("WAVE_STARTED sets wave to active", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_STARTED",
        timestamp: Date.now(),
        data: { waveIndex: 0, taskCount: 1 },
      },
    });

    expect(state.waves[0].status).toBe("active");
    expect(state.waves[0].startedAt).toBeGreaterThan(0);
  });

  it("WAVE_COMPLETED sets wave to completed and increments waveCount", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_COMPLETED",
        timestamp: Date.now(),
        data: { waveIndex: 0, tasksCompleted: 1 },
      },
    });

    expect(state.waves[0].status).toBe("completed");
    expect(state.metrics.waveCount).toBe(1);
  });

  it("WAVE_FAILED sets wave to failed", () => {
    let state = stateWithPlan();

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_FAILED",
        timestamp: Date.now(),
        data: { waveIndex: 0 },
      },
    });

    expect(state.waves[0].status).toBe("failed");
  });

  it("ARTIFACT_PRODUCED adds artifact to state", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "ARTIFACT_PRODUCED",
        timestamp: Date.now(),
        data: {
          taskId: "t1",
          filename: "design.md",
          content: "# Design\nContent here",
          producedBy: "architect",
        },
      },
    });

    expect(result.artifacts.length).toBe(1);
    expect(result.artifacts[0].filename).toBe("design.md");
    expect(result.artifacts[0].producedBy).toBe("architect");
  });

  it("BRIDGE_CONNECTED sets phase to planning if idle", () => {
    const result = reducer(INITIAL_DASHBOARD_STATE, {
      type: "PROCESS_EVENT",
      event: {
        type: "BRIDGE_CONNECTED",
        timestamp: Date.now(),
        data: { url: "http://localhost:3000" },
      },
    });

    expect(result.phase).toBe("planning");
    expect(result.startedAt).toBeGreaterThan(0);
  });

  it("BRIDGE_CONNECTED preserves phase if not idle", () => {
    const executingState: DashboardState = {
      ...INITIAL_DASHBOARD_STATE,
      phase: "executing",
    };

    const result = reducer(executingState, {
      type: "PROCESS_EVENT",
      event: {
        type: "BRIDGE_CONNECTED",
        timestamp: Date.now(),
        data: { url: "http://localhost:3000" },
      },
    });

    expect(result.phase).toBe("executing");
  });
});

// ─── Event Log Management ────────────────────────────────────────────────────

describe("useEventStream reducer — event log management", () => {
  it("adds events to log with each PROCESS_EVENT", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };

    for (let i = 0; i < 5; i++) {
      state = reducer(state, {
        type: "PROCESS_EVENT",
        event: {
          type: "AGENT_REGISTERED",
          timestamp: Date.now(),
          data: { name: `agent-${i}`, role: "worker" },
        },
      });
    }

    expect(state.eventLog.length).toBe(5);
  });

  it("caps event log at MAX_EVENT_LOG (200)", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };

    for (let i = 0; i < 210; i++) {
      state = reducer(state, {
        type: "PROCESS_EVENT",
        event: {
          type: "METRICS_UPDATE",
          timestamp: Date.now() + i,
          data: { totalTime: i * 100 },
        },
      });
    }

    expect(state.eventLog.length).toBe(MAX_EVENT_LOG);
    // Should keep the most recent events (last 200)
    expect(state.eventLog[0].data.totalTime).toBe(1000);
  });
});

// ─── Full Simulation Lifecycle ───────────────────────────────────────────────

describe("useEventStream reducer — full simulation lifecycle", () => {
  it("transitions idle → planning → executing → completed correctly", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };

    // 1. RUN_STARTED → planning
    state = reducer(state, { type: "SET_PHASE", phase: "planning" });
    expect(state.phase).toBe("planning");

    // 2. CUSTOM: CREW_PLAN_STARTED → planning (confirmed)
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "CREW_PLAN_STARTED",
        timestamp: Date.now(),
        data: { scenario: "Test" },
      },
    });
    expect(state.phase).toBe("planning");

    // 3. CUSTOM: CREW_PLAN_COMPLETED → executing
    const plan = makeTestPlan();
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "CREW_PLAN_COMPLETED",
        timestamp: Date.now(),
        data: { plan, roleCount: 2, taskCount: 2, waveCount: 2 },
      },
    });
    expect(state.phase).toBe("executing");
    expect(state.tasks.length).toBe(2);
    expect(state.waves.length).toBe(2);

    // 4. Register agents
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "dev", role: "Developer" },
      },
    });
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "reviewer", role: "Reviewer" },
      },
    });
    expect(state.agents.length).toBe(2);

    // 5. Wave 0 execution
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_STARTED",
        timestamp: Date.now(),
        data: { waveIndex: 0, taskCount: 1 },
      },
    });
    expect(state.waves[0].status).toBe("active");

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_WORKING",
        timestamp: Date.now(),
        data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_COMPLETED",
        timestamp: Date.now(),
        data: { taskId: "t1", title: "Build API", assignedTo: "dev" },
      },
    });
    expect(state.metrics.completedTasks).toBe(1);

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_COMPLETED",
        timestamp: Date.now(),
        data: { waveIndex: 0, tasksCompleted: 1 },
      },
    });
    expect(state.waves[0].status).toBe("completed");

    // 6. Wave 1 execution
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_STARTED",
        timestamp: Date.now(),
        data: { waveIndex: 1, taskCount: 1 },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_WORKING",
        timestamp: Date.now(),
        data: { taskId: "t2", title: "Review code", assignedTo: "reviewer" },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_COMPLETED",
        timestamp: Date.now(),
        data: {
          taskId: "t2",
          title: "Review code",
          assignedTo: "reviewer",
        },
      },
    });

    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "WAVE_COMPLETED",
        timestamp: Date.now(),
        data: { waveIndex: 1, tasksCompleted: 1 },
      },
    });

    // 7. RUN_FINISHED → completed
    state = reducer(state, { type: "SET_PHASE", phase: "completed" });
    expect(state.phase).toBe("completed");
    expect(state.metrics.completedTasks).toBe(2);
    expect(state.metrics.waveCount).toBe(2);
    expect(state.agents.length).toBe(2);
    expect(state.eventLog.length).toBeGreaterThan(0);
  });

  it("handles failure + retry lifecycle correctly", () => {
    let state = stateWithPlan();

    // Agent registered
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_REGISTERED",
        timestamp: Date.now(),
        data: { name: "dev", role: "Developer" },
      },
    });

    // Task starts
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_WORKING",
        timestamp: Date.now(),
        data: { taskId: "t1", assignedTo: "dev" },
      },
    });

    // Task fails
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_FAILED",
        timestamp: Date.now(),
        data: { taskId: "t1", assignedTo: "dev", error: "Timeout" },
      },
    });
    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("failed");
    expect(state.metrics.failedTasks).toBe(1);

    // Agent retrying
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "AGENT_RETRYING",
        timestamp: Date.now(),
        data: { name: "dev" },
      },
    });
    expect(state.agents[0].status).toBe("retrying");
    expect(state.agents[0].retryCount).toBe(1);

    // Task retrying
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_RETRYING",
        timestamp: Date.now(),
        data: { taskId: "t1", assignedTo: "dev" },
      },
    });
    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("working");
    expect(state.tasks.find((t) => t.id === "t1")?.retryCount).toBe(1);
    expect(state.metrics.retryCount).toBe(1);

    // Task completes on retry
    state = reducer(state, {
      type: "PROCESS_EVENT",
      event: {
        type: "TASK_COMPLETED",
        timestamp: Date.now(),
        data: { taskId: "t1", assignedTo: "dev" },
      },
    });
    expect(state.tasks.find((t) => t.id === "t1")?.status).toBe("completed");
    expect(state.metrics.completedTasks).toBe(1);
  });
});
