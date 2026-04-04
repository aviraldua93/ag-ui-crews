import { useReducer, useEffect, useCallback, useRef, useState } from "react";
import type {
  DashboardState,
  DashboardEvent,
  DashboardEventType,
  AgentState,
  WaveState,
  TaskState,
  Artifact,
  CrewPlan,
  CrewMetrics,
  SimulationConfig,
} from "@shared/types";
import { INITIAL_DASHBOARD_STATE } from "@shared/types";
import type { AgUiEvent } from "@shared/events";
import { AG_UI_EVENT_TYPES } from "@shared/events";

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

function updateWaveTask(waves: WaveState[], taskId: string, updater: (t: TaskState) => TaskState): WaveState[] {
  return waves.map((w) => ({
    ...w,
    tasks: w.tasks.map((t) => (t.id === taskId ? updater(t) : t)),
  }));
}

/** Resolves a task status change across both flat tasks and wave-nested tasks. */
function resolveTask(
  state: DashboardState,
  data: Record<string, unknown>,
  status: TaskState["status"],
  extra: Partial<TaskState> = {}
): Pick<DashboardState, "tasks" | "waves" | "metrics"> {
  const taskId = data.taskId as string;
  const updater = (t: TaskState): TaskState => ({ ...t, status, ...extra });
  return {
    tasks: updateTask(state.tasks, taskId, updater),
    waves: updateWaveTask(state.waves, taskId, updater),
    metrics: state.metrics,
  };
}

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

      switch (event.type as DashboardEventType) {
        case "CREW_PLAN_STARTED":
          return { ...state, eventLog, phase: "planning", startedAt: state.startedAt ?? Date.now() };

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
              status: "pending",
              wave: idx,
              dependsOn: wt.dependsOn,
              retryCount: 0,
            })),
          }));
          return {
            ...state,
            eventLog,
            phase: "executing",
            plan,
            tasks,
            waves,
            metrics: { ...state.metrics, taskCount: tasks.length },
          };
        }

        case "CREW_PLAN_FAILED":
          return { ...state, eventLog, phase: "error", error: (data.error as string) ?? "Planning failed" };

        case "AGENT_REGISTERED": {
          const agent: AgentState = {
            name: data.name as string,
            role: data.role as string ?? data.name as string,
            status: "idle",
            retryCount: 0,
          };
          return {
            ...state,
            eventLog,
            agents: [...state.agents, agent],
            metrics: { ...state.metrics, agentCount: state.agents.length + 1 },
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

        case "TASK_SUBMITTED": {
          const r = resolveTask(state, data, "submitted");
          return { ...state, eventLog, ...r };
        }

        case "TASK_WORKING": {
          const r = resolveTask(state, data, "working", { startedAt: Date.now() });
          return { ...state, eventLog, ...r };
        }

        case "TASK_COMPLETED": {
          const r = resolveTask(state, data, "completed", { completedAt: Date.now() });
          return {
            ...state,
            eventLog,
            ...r,
            metrics: { ...r.metrics, completedTasks: state.metrics.completedTasks + 1 },
          };
        }

        case "TASK_FAILED": {
          const r = resolveTask(state, data, "failed", { completedAt: Date.now() });
          return {
            ...state,
            eventLog,
            ...r,
            metrics: { ...r.metrics, failedTasks: state.metrics.failedTasks + 1 },
          };
        }

        case "TASK_RETRYING": {
          const taskId = data.taskId as string;
          const existing = state.tasks.find((t) => t.id === taskId);
          const rc = (existing?.retryCount ?? 0) + 1;
          const r = resolveTask(state, data, "working", { retryCount: rc });
          return {
            ...state,
            eventLog,
            ...r,
            metrics: { ...r.metrics, retryCount: state.metrics.retryCount + 1 },
          };
        }

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
          const artifact: Artifact = {
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

        case "METRICS_UPDATE": {
          const incoming = ((data.metrics as Partial<CrewMetrics>) ?? data) as Partial<CrewMetrics>;
          return {
            ...state,
            eventLog,
            metrics: { ...state.metrics, ...incoming },
          };
        }

        case "BRIDGE_CONNECTED":
          return { ...state, eventLog, phase: state.phase === "idle" ? "planning" : state.phase, startedAt: state.startedAt ?? Date.now() };

        case "BRIDGE_DISCONNECTED":
          return { ...state, eventLog };

        case "STATE_SNAPSHOT":
          // Full state replacement if data.state exists
          if (data.state) {
            return { ...(data.state as DashboardState), eventLog };
          }
          // Partial update — e.g. { phase: "completed" }
          if (data.phase) {
            return { ...state, eventLog, phase: data.phase as DashboardState["phase"] };
          }
          return { ...state, eventLog };

        default:
          return { ...state, eventLog };
      }
    }
  }
}

export function useEventStream() {
  const [state, dispatch] = useReducer(reducer, INITIAL_DASHBOARD_STATE);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    disconnect();
    setError(null);
    dispatch({ type: "SET_PHASE", phase: "connecting" });

    const es = new EventSource("/events");
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    es.onmessage = (msg) => {
      try {
        const agUiEvent: AgUiEvent = JSON.parse(msg.data);

        if (agUiEvent.type === AG_UI_EVENT_TYPES.STATE_SNAPSHOT) {
          const snapshot = agUiEvent.snapshot as DashboardState;
          if (snapshot) {
            dispatch({ type: "STATE_SNAPSHOT", state: snapshot });
          }
          return;
        }

        if (agUiEvent.type === AG_UI_EVENT_TYPES.CUSTOM) {
          const dashEvent: DashboardEvent = {
            type: agUiEvent.name as DashboardEventType,
            timestamp: agUiEvent.timestamp,
            data: (agUiEvent.value as Record<string, unknown>) ?? {},
          };
          dispatch({ type: "PROCESS_EVENT", event: dashEvent });
          return;
        }

        if (agUiEvent.type === AG_UI_EVENT_TYPES.RUN_STARTED) {
          dispatch({ type: "SET_PHASE", phase: "planning" });
          return;
        }

        if (agUiEvent.type === AG_UI_EVENT_TYPES.RUN_FINISHED) {
          dispatch({ type: "SET_PHASE", phase: "completed" });
          return;
        }

        if (agUiEvent.type === AG_UI_EVENT_TYPES.RUN_ERROR) {
          dispatch({ type: "SET_ERROR", error: (agUiEvent.message as string) ?? "Run error" });
          return;
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      setError("Connection lost. Retrying...");
    };
  }, [disconnect]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const reset = useCallback(() => {
    disconnect();
    dispatch({ type: "RESET" });
    setError(null);
  }, [disconnect]);

  return { state, isConnected, error, connect, disconnect, reset, dispatch };
}

export async function connectToBridge(url: string): Promise<void> {
  const res = await fetch("/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bridgeUrl: url }),
  });
  if (!res.ok) throw new Error(`Failed to connect: ${res.statusText}`);
}

export async function fetchState(): Promise<DashboardState | null> {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return null;
    return (await res.json()) as DashboardState;
  } catch {
    return null;
  }
}

export async function startSimulation(config?: Partial<SimulationConfig>): Promise<void> {
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config ?? { scenario: "Build a landing page", agentCount: 4, waveCount: 3 }),
  });
  if (!res.ok) throw new Error(`Failed to start simulation: ${res.statusText}`);
}

export async function stopSession(): Promise<void> {
  const res = await fetch("/api/stop", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to stop: ${res.statusText}`);
}
