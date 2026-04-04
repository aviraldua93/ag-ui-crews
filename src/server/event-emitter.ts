/**
 * SSE event hub for ag-ui-crews
 * Manages connected clients, broadcasts AG-UI events, and maintains dashboard state.
 */
import type {
  DashboardEvent,
  DashboardState,
  AgentState,
  WaveState,
  TaskState,
  Artifact,
  CrewPlan,
} from "../shared/types";
import {
  INITIAL_DASHBOARD_STATE,
  INITIAL_METRICS,
} from "../shared/types";
import type { AgUiEvent } from "../shared/events";
import {
  translateToAgUi,
  encodeSSEBatch,
  stateSnapshot,
  encodeSSE,
} from "../shared/events";

type SSEController = ReadableStreamDefaultController<Uint8Array>;

export class EventEmitter {
  private clients = new Set<SSEController>();
  private state: DashboardState = structuredClone(INITIAL_DASHBOARD_STATE);
  private encoder = new TextEncoder();

  /** Register a new SSE client and send current state snapshot */
  addClient(controller: SSEController): void {
    this.clients.add(controller);
    const snap = stateSnapshot(this.state);
    try {
      controller.enqueue(this.encoder.encode(encodeSSE(snap)));
    } catch {
      this.clients.delete(controller);
    }
  }

  /** Remove a disconnected client */
  removeClient(controller: SSEController): void {
    this.clients.delete(controller);
  }

  /** Broadcast raw AG-UI events to all connected SSE clients */
  broadcast(events: AgUiEvent[]): void {
    if (events.length === 0) return;
    const payload = this.encoder.encode(encodeSSEBatch(events));
    for (const controller of this.clients) {
      try {
        controller.enqueue(payload);
      } catch {
        this.clients.delete(controller);
      }
    }
  }

  /** Apply a dashboard event to state, translate to AG-UI, and broadcast */
  broadcastDashboardEvent(event: DashboardEvent): void {
    this.applyEvent(event);
    const aguiEvents = translateToAgUi(event);
    this.broadcast(aguiEvents);
  }

  /** Get a snapshot of current dashboard state */
  getState(): DashboardState {
    return structuredClone(this.state);
  }

  /** Reset state to initial (used when stopping a session) */
  reset(): void {
    this.state = structuredClone(INITIAL_DASHBOARD_STATE);
    const snap = stateSnapshot(this.state);
    this.broadcast([snap]);
  }

  /** Number of connected SSE clients */
  get clientCount(): number {
    return this.clients.size;
  }

  // ─── State Reducer ──────────────────────────────────────────────────────────

  private applyEvent(event: DashboardEvent): void {
    // Always log the event
    this.state.eventLog.push(event);

    switch (event.type) {
      case "BRIDGE_CONNECTED":
        this.state.phase = "connecting";
        this.state.bridgeUrl = (event.data.url as string) ?? null;
        this.state.startedAt = Date.now();
        break;

      case "BRIDGE_DISCONNECTED":
        this.state.phase = "idle";
        this.state.bridgeUrl = null;
        break;

      case "CREW_PLAN_STARTED":
        this.state.phase = "planning";
        this.state.startedAt = this.state.startedAt ?? Date.now();
        break;

      case "CREW_PLAN_COMPLETED": {
        this.state.phase = "executing";
        const plan = event.data.plan as CrewPlan | undefined;
        if (plan) {
          this.state.plan = plan;
          this.state.metrics.taskCount = plan.tasks.length;
          this.state.metrics.waveCount = plan.waves.length;
          // Initialize waves from plan
          this.state.waves = plan.waves.map((waveTasks, idx) => ({
            index: idx,
            status: "pending" as const,
            tasks: waveTasks.map((t) => ({
              id: t.id,
              title: t.title,
              assignedTo: t.assignedTo,
              status: "pending" as const,
              wave: idx,
              dependsOn: t.dependsOn,
              retryCount: 0,
            })),
          }));
          // Flatten tasks
          this.state.tasks = this.state.waves.flatMap((w) => w.tasks);
        }
        break;
      }

      case "CREW_PLAN_FAILED":
        this.state.phase = "error";
        this.state.error = (event.data.error as string) ?? "Planning failed";
        break;

      case "WAVE_STARTED": {
        const waveIdx = event.data.waveIndex as number;
        const wave = this.state.waves[waveIdx];
        if (wave) {
          wave.status = "active";
          wave.startedAt = event.timestamp;
        }
        break;
      }

      case "WAVE_COMPLETED": {
        const waveIdx = event.data.waveIndex as number;
        const wave = this.state.waves[waveIdx];
        if (wave) {
          wave.status = "completed";
          wave.completedAt = event.timestamp;
        }
        break;
      }

      case "WAVE_FAILED": {
        const waveIdx = event.data.waveIndex as number;
        const wave = this.state.waves[waveIdx];
        if (wave) {
          wave.status = "failed";
          wave.completedAt = event.timestamp;
        }
        break;
      }

      case "AGENT_REGISTERED": {
        const existing = this.state.agents.find(
          (a) => a.name === event.data.name
        );
        if (!existing) {
          this.state.agents.push({
            name: event.data.name as string,
            role: (event.data.role as string) ?? "",
            status: "idle",
            retryCount: 0,
          });
          this.state.metrics.agentCount = this.state.agents.length;
        }
        break;
      }

      case "AGENT_ACTIVE": {
        const agent = this.state.agents.find(
          (a) => a.name === event.data.name
        );
        if (agent) {
          agent.status = "active";
          agent.currentTask = event.data.taskId as string | undefined;
          agent.startedAt = agent.startedAt ?? event.timestamp;
        }
        break;
      }

      case "AGENT_COMPLETED": {
        const agent = this.state.agents.find(
          (a) => a.name === event.data.name
        );
        if (agent) {
          agent.status = "completed";
          agent.completedAt = event.timestamp;
          agent.currentTask = undefined;
        }
        break;
      }

      case "AGENT_FAILED": {
        const agent = this.state.agents.find(
          (a) => a.name === event.data.name
        );
        if (agent) {
          agent.status = "failed";
          agent.currentTask = undefined;
        }
        break;
      }

      case "AGENT_RETRYING": {
        const agent = this.state.agents.find(
          (a) => a.name === event.data.name
        );
        if (agent) {
          agent.status = "retrying";
          agent.retryCount += 1;
        }
        break;
      }

      case "TASK_SUBMITTED": {
        const task = this.findTask(event.data.taskId as string);
        if (task) {
          task.status = "submitted";
        }
        break;
      }

      case "TASK_WORKING": {
        const task = this.findTask(event.data.taskId as string);
        if (task) {
          task.status = "working";
          task.startedAt = event.timestamp;
        }
        break;
      }

      case "TASK_COMPLETED": {
        const task = this.findTask(event.data.taskId as string);
        if (task) {
          task.status = "completed";
          task.completedAt = event.timestamp;
          task.artifact = event.data.artifact as string | undefined;
          this.state.metrics.completedTasks += 1;
        }
        break;
      }

      case "TASK_FAILED": {
        const task = this.findTask(event.data.taskId as string);
        if (task) {
          task.status = "failed";
          task.completedAt = event.timestamp;
          this.state.metrics.failedTasks += 1;
        }
        break;
      }

      case "TASK_RETRYING": {
        const task = this.findTask(event.data.taskId as string);
        if (task) {
          task.status = "submitted";
          task.retryCount += 1;
          this.state.metrics.retryCount += 1;
        }
        break;
      }

      case "ARTIFACT_PRODUCED": {
        const artifact: Artifact = {
          taskId: event.data.taskId as string,
          filename: event.data.filename as string,
          content: event.data.content as string,
          producedBy: event.data.producedBy as string,
          producedAt: event.timestamp,
        };
        this.state.artifacts.push(artifact);
        break;
      }

      case "METRICS_UPDATE": {
        const updates = event.data as Record<string, unknown>;
        if (updates.totalTime !== undefined)
          this.state.metrics.totalTime = updates.totalTime as number;
        if (updates.completedTasks !== undefined)
          this.state.metrics.completedTasks = updates.completedTasks as number;
        if (updates.failedTasks !== undefined)
          this.state.metrics.failedTasks = updates.failedTasks as number;
        break;
      }

      case "STATE_SNAPSHOT":
        // Full state replacement from bridge or simulation
        if (event.data.state) {
          this.state = {
            ...(event.data.state as DashboardState),
            eventLog: this.state.eventLog,
          };
        }
        // Partial update — e.g. { phase: "completed" }
        if (event.data.phase) {
          this.state.phase = event.data.phase as DashboardState["phase"];
        }
        break;
    }
  }

  private findTask(taskId: string): TaskState | undefined {
    // Search in flat tasks list
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (task) return task;
    // Also search in waves (should be the same references, but just in case)
    for (const wave of this.state.waves) {
      const waveTask = wave.tasks.find((t) => t.id === taskId);
      if (waveTask) return waveTask;
    }
    return undefined;
  }
}
