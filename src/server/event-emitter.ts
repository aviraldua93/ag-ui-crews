/**
 * SSE event hub and state reducer for ag-ui-crews.
 *
 * This module contains the {@link EventEmitter} class — the central nervous system
 * of the server. It serves three responsibilities:
 *
 * 1. **Client connection management** — Maintains a set of SSE
 *    {@link ReadableStreamDefaultController}s. New clients receive an immediate
 *    `STATE_SNAPSHOT` event so the UI can hydrate without a round-trip.
 *
 * 2. **State reduction** — Maintains the canonical {@link DashboardState} in memory.
 *    Every incoming {@link DashboardEvent} is applied through a switch-based reducer
 *    ({@link EventEmitter.applyEvent | applyEvent}) that mutates state before events
 *    are forwarded to clients. This guarantees that the SSE stream and the REST
 *    `GET /api/state` endpoint always reflect the same truth.
 *
 * 3. **AG-UI protocol translation** — Delegates to
 *    {@link ../shared/events.translateToAgUi | translateToAgUi} to convert
 *    dashboard-specific events into AG-UI protocol events (steps, text messages,
 *    state deltas, custom events) before encoding them as SSE frames.
 *
 * The emitter is shared as a singleton by all route handlers, the simulator,
 * and the bridge connector.
 *
 * @module server/event-emitter
 */
import type {
  DashboardEvent,
  DashboardState,
  AgentState,
  WaveState,
  TaskState,
  Artifact,
  CrewPlan,
  WorktreeStatus,
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

/** Type alias for the controller side of a `ReadableStream<Uint8Array>` used by SSE clients. */
type SSEController = ReadableStreamDefaultController<Uint8Array>;

/**
 * Central SSE hub that manages client connections, maintains the canonical
 * {@link DashboardState}, and translates {@link DashboardEvent}s into AG-UI
 * protocol events for real-time streaming.
 *
 * All mutations to dashboard state flow through this class's
 * {@link broadcastDashboardEvent} method, which first applies the event to
 * the in-memory state via the {@link applyEvent | private reducer}, then
 * translates the event to AG-UI wire format and pushes it to every connected
 * SSE client.
 *
 * The class is designed as a singleton per server process — the module-level
 * `emitter` instance in `index.ts` is shared by route handlers, the simulator,
 * and the bridge connector.
 */
export class EventEmitter {
  /** Set of currently connected SSE client stream controllers. */
  private clients = new Set<SSEController>();
  /** Canonical dashboard state — mutated in-place by the {@link applyEvent} reducer. */
  private state: DashboardState = structuredClone(INITIAL_DASHBOARD_STATE);
  /** Shared TextEncoder instance for converting SSE string frames to `Uint8Array`. */
  private encoder = new TextEncoder();
  /** Heartbeat interval that keeps SSE connections alive and flushes proxy buffers. */
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Send SSE comment heartbeats every 15s to keep connections alive
    // and force proxy buffers (e.g. Vite dev proxy) to flush.
    this.heartbeatInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      const heartbeat = this.encoder.encode(": heartbeat\n\n");
      for (const controller of this.clients) {
        try { controller.enqueue(heartbeat); } catch { this.clients.delete(controller); }
      }
    }, 15_000);
  }

  /**
   * Registers a new SSE client and immediately sends the current
   * {@link DashboardState} as a `STATE_SNAPSHOT` AG-UI event.
   *
   * This ensures that clients connecting mid-session see the full current state
   * without needing to replay the event log. If the initial enqueue fails
   * (e.g., the client disconnected before the snapshot could be sent), the
   * controller is silently removed from the client set.
   *
   * @param controller - The {@link ReadableStreamDefaultController} for the new
   *                     SSE connection's `ReadableStream<Uint8Array>`.
   *
   * @sideEffect Sends a `STATE_SNAPSHOT` SSE frame to the newly added client.
   */
  addClient(controller: SSEController): void {
    this.clients.add(controller);
    const snap = stateSnapshot(this.state);
    try {
      controller.enqueue(this.encoder.encode(encodeSSE(snap)));
    } catch {
      this.clients.delete(controller);
    }
  }

  /**
   * Unregisters a disconnected SSE client.
   *
   * Called from the `ReadableStream`'s `cancel` callback when the client drops
   * the connection. After removal, subsequent broadcasts skip this controller.
   *
   * @param controller - The controller to remove from the client set.
   */
  removeClient(controller: SSEController): void {
    this.clients.delete(controller);
  }

  /**
   * Broadcasts pre-built AG-UI events to all connected SSE clients.
   *
   * Events are serialised to SSE `data:` frames via {@link encodeSSEBatch},
   * then encoded to `Uint8Array` once and enqueued to every controller. If a
   * controller throws during enqueue (client disconnected), it is automatically
   * removed from the client set — this is the primary garbage-collection
   * mechanism for stale connections.
   *
   * @param events - One or more {@link AgUiEvent} objects to send. If the array
   *                 is empty, the method returns immediately (no-op optimisation).
   */
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

  /**
   * The primary event ingestion method: applies a dashboard event to state,
   * translates it to AG-UI protocol events, and broadcasts to all SSE clients.
   *
   * This is the method called by the simulator, bridge connector, and route
   * handlers to push state changes through the system. The sequence is:
   * 1. {@link applyEvent} mutates in-memory {@link DashboardState}.
   * 2. {@link translateToAgUi} converts the event to one or more AG-UI events.
   * 3. {@link broadcast} serialises and enqueues the AG-UI events.
   *
   * @param event - The {@link DashboardEvent} to process. Must have a valid
   *                `type`, `timestamp`, and `data` payload.
   *
   * @sideEffect Mutates `this.state` and sends SSE frames to all clients.
   */
  broadcastDashboardEvent(event: DashboardEvent): void {
    this.applyEvent(event);
    const aguiEvents = translateToAgUi(event);
    this.broadcast(aguiEvents);
  }

  /**
   * Returns a deep clone of the current {@link DashboardState}.
   *
   * Used by the `GET /api/state` route to provide a point-in-time snapshot
   * without exposing the mutable internal state to consumers.
   *
   * @returns A deep-cloned copy of the dashboard state.
   */
  getState(): DashboardState {
    return structuredClone(this.state);
  }

  /**
   * Resets the dashboard state to {@link INITIAL_DASHBOARD_STATE} and broadcasts
   * a `STATE_SNAPSHOT` to all clients so their UIs return to the idle screen.
   *
   * Called by `handleStop()` and at the beginning of `handleConnect()` /
   * `handleSimulate()` to ensure a clean slate before starting a new session.
   *
   * @sideEffect Replaces `this.state` with a fresh clone and sends a snapshot.
   */
  reset(): void {
    this.state = structuredClone(INITIAL_DASHBOARD_STATE);
    const snap = stateSnapshot(this.state);
    this.broadcast([snap]);
  }

  /**
   * The number of SSE clients currently connected.
   *
   * Exposed as a getter for the `GET /api/health` endpoint.
   *
   * @returns The size of the internal client set.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  // ─── State Reducer ──────────────────────────────────────────────────────────

  /**
   * State reducer that applies a {@link DashboardEvent} to the in-memory
   * {@link DashboardState}.
   *
   * Every event is first appended to `state.eventLog` for audit/replay, then
   * the switch-case mutates the relevant state slice. The 18 handled event
   * types and their state mutations are:
   *
   * | Event Type            | State Mutation |
   * |-----------------------|----------------|
   * | `BRIDGE_CONNECTED`    | Sets phase → `"connecting"`, stores `bridgeUrl`, records `startedAt`. |
   * | `BRIDGE_DISCONNECTED` | Sets phase → `"idle"`, clears `bridgeUrl`. |
   * | `CREW_PLAN_STARTED`   | Sets phase → `"planning"`, records `startedAt` if not set. |
   * | `CREW_PLAN_COMPLETED` | Sets phase → `"executing"`, stores the full {@link CrewPlan}, initialises waves and flat task list, updates metrics (`taskCount`, `waveCount`). |
   * | `CREW_PLAN_FAILED`    | Sets phase → `"error"`, stores error message. |
   * | `WAVE_STARTED`        | Sets wave status → `"active"`, records `startedAt`. |
   * | `WAVE_COMPLETED`      | Sets wave status → `"completed"`, records `completedAt`. |
   * | `WAVE_FAILED`         | Sets wave status → `"failed"`, records `completedAt`. |
   * | `AGENT_REGISTERED`    | Pushes a new {@link AgentState} (deduplicated by name), updates `metrics.agentCount`. |
   * | `AGENT_ACTIVE`        | Sets agent status → `"active"`, stores `currentTask` and `startedAt`. |
   * | `AGENT_COMPLETED`     | Sets agent status → `"completed"`, records `completedAt`, clears `currentTask`. |
   * | `AGENT_FAILED`        | Sets agent status → `"failed"`, clears `currentTask`. |
   * | `AGENT_RETRYING`      | Sets agent status → `"retrying"`, increments `retryCount`. |
   * | `TASK_SUBMITTED`      | Sets task status → `"submitted"`. |
   * | `TASK_WORKING`        | Sets task status → `"working"`, records `startedAt`. |
   * | `TASK_COMPLETED`      | Sets task status → `"completed"`, records `completedAt` and optional `artifact`, increments `metrics.completedTasks`. |
   * | `TASK_FAILED`         | Sets task status → `"failed"`, records `completedAt`, increments `metrics.failedTasks`. |
   * | `TASK_RETRYING`       | Resets task status → `"submitted"`, increments task and global `retryCount`. |
   * | `ARTIFACT_PRODUCED`   | Pushes a new {@link Artifact} to `state.artifacts`. |
   * | `WORKTREE_CREATED`    | Pushes a new {@link WorktreeStatus} with status `"active"`. |
   * | `WORKTREE_MERGED`     | Sets worktree status → `"merged"`, updates `filesChanged`. |
   * | `WORKTREE_CONFLICT`   | Sets worktree status → `"conflict"`. |
   * | `WORKTREE_REMOVED`    | Sets worktree status → `"cleaned"`. |
   * | `METRICS_UPDATE`      | Merges partial metric overrides (`totalTime`, `completedTasks`, `failedTasks`). |
   * | `STATE_SNAPSHOT`      | Full state replacement (if `data.state`) or partial phase update (if `data.phase`), preserving `eventLog`. |
   *
   * @param event - The dashboard event to reduce into state.
   */
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

      case "WORKTREE_CREATED": {
        const wt: WorktreeStatus = {
          agentName: event.data.agentName as string,
          branch: event.data.branch as string,
          path: event.data.path as string,
          status: "active",
          filesChanged: (event.data.filesChanged as number | undefined) ?? 0,
          createdAt: (event.data.createdAt as string) ?? new Date().toISOString(),
        };
        this.state.worktrees.push(wt);
        break;
      }

      case "WORKTREE_MERGED": {
        const agentName = event.data.agentName as string;
        const wt = this.state.worktrees.find((w) => w.agentName === agentName);
        if (wt) {
          wt.status = "merged";
          if (event.data.filesChanged !== undefined) {
            wt.filesChanged = event.data.filesChanged as number;
          }
        }
        break;
      }

      case "WORKTREE_CONFLICT": {
        const agentName = event.data.agentName as string;
        const wt = this.state.worktrees.find((w) => w.agentName === agentName);
        if (wt) wt.status = "conflict";
        break;
      }

      case "WORKTREE_REMOVED": {
        const agentName = event.data.agentName as string;
        const wt = this.state.worktrees.find((w) => w.agentName === agentName);
        if (wt) wt.status = "cleaned";
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
        if (updates.agentCount !== undefined)
          this.state.metrics.agentCount = updates.agentCount as number;
        if (updates.taskCount !== undefined)
          this.state.metrics.taskCount = updates.taskCount as number;
        if (updates.waveCount !== undefined)
          this.state.metrics.waveCount = updates.waveCount as number;
        if (updates.retryCount !== undefined)
          this.state.metrics.retryCount = updates.retryCount as number;
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

  /**
   * Locates a {@link TaskState} by ID using a dual-lookup strategy.
   *
   * 1. **Primary lookup** — Searches the flat `state.tasks` array, which is the
   *    authoritative source after `CREW_PLAN_COMPLETED` flattens all wave tasks.
   * 2. **Fallback lookup** — If not found in the flat list (e.g., during edge-case
   *    timing issues), iterates through each wave's `tasks` array. These should be
   *    the same object references as the flat list, but the fallback ensures
   *    robustness when state is partially initialised.
   *
   * @param taskId - The unique task identifier to search for.
   * @returns The matching {@link TaskState}, or `undefined` if no task with that ID exists.
   */
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
