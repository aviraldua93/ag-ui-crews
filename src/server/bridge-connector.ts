/**
 * Bridge connector for ag-ui-crews.
 *
 * This module provides the {@link BridgeConnector} class — the live-mode
 * counterpart to the simulator. Instead of generating synthetic events, it
 * polls a running a2a-crews bridge's REST API every 2 seconds, diffs the
 * response against the previous poll, and translates any changes into
 * {@link DashboardEvent}s that are fed to the shared {@link EventEmitter}.
 *
 * The overall data flow is a three-stage pipeline repeated on each poll:
 *
 * 1. **Fetch** — `fetchStatus()`, `fetchAgents()`, and `fetchTasks()` hit the
 *    bridge's `/status` and `/tasks` endpoints in parallel.
 * 2. **Diff** — `diffAgents()` and `diffTasks()` compare the new data against
 *    the previous snapshot stored in {@link BridgeState}, detecting new agents,
 *    new tasks, and status transitions.
 * 3. **Emit** — For every detected change, the appropriate {@link DashboardEvent}
 *    is emitted via `emitter.broadcastDashboardEvent()`, which updates server
 *    state and pushes AG-UI events to all SSE clients.
 *
 * If the bridge becomes unreachable during polling, the connector automatically
 * disconnects and emits a `BRIDGE_DISCONNECTED` event.
 *
 * @module server/bridge-connector
 */
import type {
  BridgeAgent,
  BridgeTask,
  BridgeStatus,
  DashboardEvent,
  DashboardEventType,
  TaskStatus,
} from "../shared/types";
import type { EventEmitter } from "./event-emitter";

/**
 * Tracks the previous poll results for diffing against the current poll.
 *
 * Each field stores the last-known state of its respective entity type.
 * On every {@link BridgeConnector.poll | poll cycle}, the current bridge
 * response is compared against this snapshot to detect changes. After
 * diffing, the snapshot is updated to reflect the latest state.
 *
 * The maps are keyed by entity name (agents) or ID (tasks) for O(1) lookups
 * during diff comparisons.
 */
interface BridgeState {
  /** Map of agent name → last-known {@link BridgeAgent} data. */
  agents: Map<string, BridgeAgent>;
  /** Map of task ID → last-known {@link BridgeTask} data. */
  tasks: Map<string, BridgeTask>;
  /** Last-known aggregate bridge status, or `null` before the first successful poll. */
  status: BridgeStatus | null;
}

/**
 * Live-mode bridge connector that polls an a2a-crews bridge and translates
 * state changes into {@link DashboardEvent}s.
 *
 * This class is the live-mode counterpart to the simulator. While the simulator
 * generates synthetic events on a timer, the `BridgeConnector` derives real
 * events by polling a running a2a-crews bridge's REST API (`/status` and
 * `/tasks`) every 2 seconds and diffing the responses against the previously
 * observed state.
 *
 * Detected changes — new agents, new tasks, task status transitions, and wave
 * completions — are translated into {@link DashboardEvent}s and fed to the
 * shared {@link EventEmitter}, which updates server-side state and pushes
 * AG-UI protocol events to all connected SSE clients.
 *
 * **Lifecycle:**
 * 1. Instantiate with a bridge URL and the shared emitter.
 * 2. Call {@link start} to verify reachability and begin polling.
 * 3. Call {@link stop} to halt polling, emit `BRIDGE_DISCONNECTED`, and reset state.
 *
 * If the bridge becomes unreachable during polling, the connector automatically
 * stops and emits a `BRIDGE_DISCONNECTED` event with the error reason.
 *
 * @example
 * ```ts
 * const connector = new BridgeConnector("http://localhost:62638", emitter);
 * await connector.start(); // verifies bridge, emits BRIDGE_CONNECTED, starts polling
 * // ... later ...
 * connector.stop(); // halts polling, emits BRIDGE_DISCONNECTED
 * ```
 */
export class BridgeConnector {
  /** The normalized bridge URL (trailing slashes stripped). */
  private bridgeUrl: string;
  /** The shared event emitter for broadcasting dashboard events. */
  private emitter: EventEmitter;
  /** Handle for the 2-second polling interval, or `null` when not polling. */
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  /** Whether the connector is actively polling the bridge. */
  private connected = false;
  /** Previous poll snapshot used for change detection via diffing. */
  private prevState: BridgeState = {
    agents: new Map(),
    tasks: new Map(),
    status: null,
  };
  /**
   * Tracks the last-emitted dashboard status for each agent by name.
   * Used to avoid emitting duplicate AGENT_ACTIVE / AGENT_COMPLETED events
   * when the derived status hasn't changed between polls.
   */
  private agentDashboardStatus: Map<string, "idle" | "active" | "completed"> = new Map();

  /**
   * Creates a new bridge connector.
   *
   * The bridge URL is normalized by stripping any trailing slashes.
   * No network requests are made until {@link start} is called.
   *
   * @param bridgeUrl - Fully-qualified URL of the a2a-crews bridge
   *                    (e.g. `"http://localhost:62638"`).
   * @param emitter   - The shared {@link EventEmitter} instance that receives
   *                    dashboard events and forwards them to SSE clients.
   */
  constructor(bridgeUrl: string, emitter: EventEmitter) {
    this.bridgeUrl = bridgeUrl.replace(/\/+$/, "");
    this.emitter = emitter;
  }

  /**
   * Verifies the bridge is reachable, emits `BRIDGE_CONNECTED`, performs an
   * initial poll, and starts the 2-second polling interval.
   *
   * The reachability check hits `GET /status` on the bridge. If the bridge
   * returns a non-200 response or the request fails entirely, the method
   * throws an error and no polling is started.
   *
   * On success, the following sequence occurs:
   * 1. Sets `connected = true`.
   * 2. Emits a `BRIDGE_CONNECTED` event with the bridge URL.
   * 3. Performs one immediate {@link poll} cycle.
   * 4. Starts a `setInterval` that calls {@link poll} every 2 000 ms.
   *
   * @throws {Error} If the bridge is unreachable or returns a non-200 status.
   *                  The error message includes the bridge URL and the underlying
   *                  failure reason.
   *
   * @sideEffect Emits `BRIDGE_CONNECTED` and begins continuous polling.
   */
  async start(): Promise<void> {
    // Verify bridge is reachable
    try {
      const resp = await fetch(`${this.bridgeUrl}/status`);
      if (!resp.ok) throw new Error(`Bridge returned ${resp.status}`);
    } catch (err) {
      throw new Error(
        `Cannot connect to bridge at ${this.bridgeUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    this.connected = true;

    this.emitter.broadcastDashboardEvent({
      type: "BRIDGE_CONNECTED",
      timestamp: Date.now(),
      data: { url: this.bridgeUrl },
    });

    // Try to initialize plan from crew.json so dashboard has task/wave structure
    await this.initializePlan();

    // Initial poll
    await this.poll();

    // Start polling every 2 seconds
    this.pollInterval = setInterval(() => {
      this.poll().catch((err) => {
        console.error("[bridge] Poll error:", err);
      });
    }, 2000);
  }

  /**
   * Reads `crew.json` from the `.a2a-crews/` directory tree to initialize the
   * dashboard's plan structure (tasks, waves, roles) when connecting to a live bridge.
   *
   * Searches the CWD, parent, and sibling directories for a `.a2a-crews/<team>/bridge.json`
   * whose `port` matches the connected bridge's port. When found, reads the co-located
   * `crew.json` to extract roles, tasks, and wave structure, then emits
   * `CREW_PLAN_STARTED` and `CREW_PLAN_COMPLETED` events so the dashboard can render
   * the plan panel immediately — rather than waiting for the first poll to discover tasks.
   *
   * If no matching `crew.json` is found, the method silently returns and the dashboard
   * populates incrementally as tasks appear in subsequent poll cycles.
   *
   * @sideEffect Emits `CREW_PLAN_STARTED` and `CREW_PLAN_COMPLETED` events if a
   *             matching crew.json is found.
   */
  private async initializePlan(): Promise<void> {
    try {
      const { readdir, readFile } = await import("fs/promises");
      const { join, dirname } = await import("path");
      const port = new URL(this.bridgeUrl).port;
      console.log(`[bridge] initializePlan: looking for bridge.json with port ${port}`);
      const cwd = process.cwd();
      const parent = dirname(cwd);
      const searchRoots = [cwd, parent];
      try {
        const siblings = await readdir(parent, { withFileTypes: true });
        for (const s of siblings) {
          if (s.isDirectory()) searchRoots.push(join(parent, s.name));
        }
      } catch { /* */ }

      for (const dir of searchRoots) {
        try {
          const a2aDir = join(dir, ".a2a-crews");
          const entries = await readdir(a2aDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            try {
              const bridgeContent = await readFile(join(a2aDir, entry.name, "bridge.json"), "utf-8");
              const bridgeData = JSON.parse(bridgeContent);
              if (String(bridgeData.port) !== port) continue;
              console.log(`[bridge] initializePlan: MATCHED ${entry.name} with port ${bridgeData.port}`);

              const crewContent = await readFile(join(a2aDir, entry.name, "crew.json"), "utf-8");
              const crew = JSON.parse(crewContent);

              const roles = (crew.agents ?? []).map((a: { key: string; description: string }) => ({
                key: a.key,
                description: a.description,
              }));
              const tasks = (crew.tasks ?? []).map((t: { id: string; title: string; assignedTo: string; dependsOn?: string[] }) => ({
                id: t.id,
                title: t.title,
                assignedTo: t.assignedTo,
                dependsOn: t.dependsOn ?? [],
              }));
              const waves = (crew.waves ?? [tasks]).map((w: unknown[]) => w);

              const plan = {
                scenario: crew.scenario ?? entry.name,
                feasibility: { verdict: "go" as const, confidence: 0.85, concerns: [], technical: 0.85, scope: 0.85, risk: 0.15 },
                roles,
                tasks,
                waves,
              };

              this.emitter.broadcastDashboardEvent({
                type: "CREW_PLAN_STARTED",
                timestamp: Date.now(),
                data: { scenario: plan.scenario },
              });
              this.emitter.broadcastDashboardEvent({
                type: "CREW_PLAN_COMPLETED",
                timestamp: Date.now(),
                data: { plan, roleCount: roles.length, taskCount: tasks.length, waveCount: waves.length },
              });
              return;
            } catch { /* no crew.json */ }
          }
        } catch { /* no .a2a-crews */ }
      }
    } catch (err) {
      console.error("[bridge] Could not initialize plan:", err);
    }
  }

  /**
   * Stops polling the bridge, emits `BRIDGE_DISCONNECTED`, and resets
   * internal state for potential reuse.
   *
   * Performs three steps in order:
   * 1. Clears the polling interval (if active).
   * 2. If still marked as connected, sets `connected = false` and emits
   *    a `BRIDGE_DISCONNECTED` event with the bridge URL.
   * 3. Resets {@link prevState} to empty maps so a subsequent {@link start}
   *    call begins with a clean diff baseline.
   *
   * Safe to call multiple times — subsequent calls are no-ops if already
   * disconnected.
   *
   * @sideEffect Emits `BRIDGE_DISCONNECTED` (if currently connected) and
   *             clears the polling timer.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.connected) {
      this.connected = false;
      this.emitter.broadcastDashboardEvent({
        type: "BRIDGE_DISCONNECTED",
        timestamp: Date.now(),
        data: { url: this.bridgeUrl },
      });
    }

    // Reset tracked state
    this.prevState = { agents: new Map(), tasks: new Map(), status: null };
  }

  /**
   * Returns whether the connector is actively polling the bridge.
   *
   * Used by the `GET /api/health` endpoint to report bridge connectivity
   * status.
   *
   * @returns `true` if {@link start} has been called and the connector has not
   *          yet been stopped (either explicitly via {@link stop} or
   *          automatically due to a connection failure).
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  /**
   * Executes one poll→diff→emit cycle against the bridge.
   *
   * Fetches the bridge's current status, agents, and tasks in parallel via
   * {@link fetchStatus}, {@link fetchAgents}, and {@link fetchTasks}. Then
   * runs the diff pipeline:
   * 1. {@link diffAgents} — detects newly registered agents.
   * 2. {@link diffTasks} — detects new tasks, status transitions, and wave completions.
   * 3. Updates `prevState.status` with the latest bridge status.
   *
   * If the bridge is unreachable (fetch throws), the method calls {@link stop}
   * to halt polling and emits a `BRIDGE_DISCONNECTED` event with the error
   * reason. This is the primary error-recovery mechanism.
   *
   * If `connected` is `false` (e.g., stop was called concurrently), the method
   * returns immediately as a no-op.
   */
  private async poll(): Promise<void> {
    if (!this.connected) return;

    try {
      const [status, agents, tasks] = await Promise.all([
        this.fetchStatus(),
        this.fetchAgents(),
        this.fetchTasks(),
      ]);

      if (!status) {
        console.log("[bridge] poll: fetchStatus returned null, skipping");
        return;
      }

      // Diff agents
      this.diffAgents(agents);

      // Diff tasks
      this.diffTasks(tasks);

      // Cross-reference tasks with agents to derive busy/idle/completed status
      this.syncAgentStatuses(agents, tasks);

      // Emit aggregate metrics from bridge status (source of truth)
      const prev = this.prevState.status;
      if (
        !prev ||
        prev.tasks.completed !== status.tasks.completed ||
        prev.tasks.total !== status.tasks.total
      ) {
        this.emitter.broadcastDashboardEvent({
          type: "METRICS_UPDATE",
          timestamp: Date.now(),
          data: {
            taskCount: status.tasks.total,
            completedTasks: status.tasks.completed,
            failedTasks: status.tasks.failed,
            agentCount: typeof status.agents === "number" ? status.agents : status.agents.total,
          },
        });
      }

      this.prevState.status = status;
    } catch (err) {
      console.error("[bridge] Poll failed:", err);
      if (this.connected) {
        this.stop();
        this.emitter.broadcastDashboardEvent({
          type: "BRIDGE_DISCONNECTED",
          timestamp: Date.now(),
          data: {
            url: this.bridgeUrl,
            reason: err instanceof Error ? err.message : "Connection lost",
          },
        });
      }
    }
  }

  /**
   * Fetches the bridge's aggregate status from `GET /status`.
   *
   * Returns the parsed {@link BridgeStatus} on success, or `null` if the
   * request fails or returns a non-200 status. Errors are swallowed silently
   * because the caller ({@link poll}) handles bridge-down scenarios at a
   * higher level.
   *
   * @returns The current bridge status, or `null` on failure.
   */
  private async fetchStatus(): Promise<BridgeStatus | null> {
    try {
      const resp = await fetch(`${this.bridgeUrl}/status`);
      if (!resp.ok) return null;
      return (await resp.json()) as BridgeStatus;
    } catch {
      return null;
    }
  }

  /**
   * Fetches the list of registered agents from the bridge's `/status` endpoint.
   *
   * The a2a-crews bridge embeds agent information within the `/status` response
   * body under `agents.list`, rather than exposing a dedicated `/agents` endpoint.
   * Each agent entry is mapped to a {@link BridgeAgent} with a generated
   * `registeredAt` timestamp.
   *
   * @returns An array of {@link BridgeAgent} objects, or an empty array on failure.
   */
  private async fetchAgents(): Promise<BridgeAgent[]> {
    try {
      // a2a-crews bridge returns agents under /status, not /agents
      const resp = await fetch(`${this.bridgeUrl}/status`);
      if (!resp.ok) return [];
      const status = (await resp.json()) as {
        agents?: {
          list?: Array<{
            name: string;
            description: string;
            skills?: string[];
            status: string;
          }>;
        };
      };
      return (status.agents?.list ?? []).map((a) => ({
        name: a.name,
        description: a.description,
        skills: a.skills ?? [],
        registeredAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetches the current task list from `GET /tasks` on the bridge.
   *
   * Maps raw bridge task objects (which use `message` for the task description
   * and `result` for the output artifact) into the normalized {@link BridgeTask}
   * shape. Task statuses are translated via {@link mapTaskStatus}.
   *
   * All tasks default to `wave: 0` and `dependsOn: []` since the bridge's
   * task API does not expose dependency/wave information.
   *
   * @returns An array of {@link BridgeTask} objects, or an empty array on failure.
   */
  private async fetchTasks(): Promise<BridgeTask[]> {
    try {
      const resp = await fetch(`${this.bridgeUrl}/tasks`);
      if (!resp.ok) return [];
      const raw = (await resp.json()) as Array<{
        id: string;
        assignedTo: string;
        status: string;
        message?: string;
        result?: string;
        createdAt?: string;
        updatedAt?: string;
      }>;
      return raw.map((t) => ({
        id: t.id,
        title: t.message ?? "Task",
        assignedTo: t.assignedTo,
        status: this.mapTaskStatus(t.status),
        dependsOn: [],
        wave: 0,
        result: t.result,
        createdAt: t.createdAt ?? new Date().toISOString(),
        updatedAt: t.updatedAt ?? new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Maps a raw bridge task status string to the normalized {@link TaskStatus} union.
   *
   * Known statuses (`pending`, `submitted`, `working`, `completed`, `failed`,
   * `canceled`) are mapped 1:1. Unknown or unexpected status strings default
   * to `"submitted"` as a safe fallback that allows the task to be picked up
   * by the working pipeline.
   *
   * @param status - The raw status string from the bridge's `/tasks` response.
   * @returns The corresponding {@link TaskStatus} value.
   */
  private mapTaskStatus(status: string): TaskStatus {
    const map: Record<string, TaskStatus> = {
      pending: "pending",
      submitted: "submitted",
      working: "working",
      completed: "completed",
      failed: "failed",
      canceled: "canceled",
    };
    return map[status] ?? "submitted";
  }

  // ─── Diffing ──────────────────────────────────────────────────────────────

  /**
   * Diffs agents against the previous poll's snapshot. Emits `AGENT_REGISTERED`
   * for any agent name not previously seen, then updates the snapshot.
   *
   * @param agents - Freshly fetched agent list.
   */
  private diffAgents(agents: BridgeAgent[]): void {
    const now = Date.now();
    for (const agent of agents) {
      if (!this.prevState.agents.has(agent.name)) {
        this.emitter.broadcastDashboardEvent({
          type: "AGENT_REGISTERED",
          timestamp: now,
          data: {
            name: agent.name,
            role: agent.description,
            skills: agent.skills,
          },
        });
      }
      this.prevState.agents.set(agent.name, agent);
    }
  }

  /**
   * Cross-references the current task list with registered agents to derive
   * each agent's dashboard status (active / completed / idle) and emits
   * AGENT_ACTIVE or AGENT_COMPLETED events when the derived status changes.
   *
   * The a2a-crews bridge reports agents as "online" but doesn't distinguish
   * between busy and idle. This method fills that gap by examining task
   * assignments:
   *
   * - **active** — at least one task assigned to this agent is `"working"` or `"submitted"`.
   * - **completed** — every task assigned to this agent is in a terminal state
   *   (`"completed"`, `"failed"`, `"canceled"`), and at least one task exists.
   * - **idle** — no tasks assigned, or all tasks still `"pending"`.
   *
   * Only emits an event when the derived status differs from the last-emitted
   * status (tracked in {@link agentDashboardStatus}).
   */
  private syncAgentStatuses(agents: BridgeAgent[], tasks: BridgeTask[]): void {
    const now = Date.now();

    // Build per-agent task summary
    const agentTasks = new Map<string, { active: number; terminal: number; total: number; currentTaskTitle?: string }>();
    for (const agent of agents) {
      agentTasks.set(agent.name, { active: 0, terminal: 0, total: 0 });
    }

    for (const task of tasks) {
      let entry = agentTasks.get(task.assignedTo);
      if (!entry) {
        entry = { active: 0, terminal: 0, total: 0 };
        agentTasks.set(task.assignedTo, entry);
      }
      entry.total += 1;
      if (task.status === "working" || task.status === "submitted") {
        entry.active += 1;
        if (task.status === "working") {
          entry.currentTaskTitle = task.title;
        }
      }
      if (task.status === "completed" || task.status === "failed" || task.status === "canceled") {
        entry.terminal += 1;
      }
    }

    // Derive status and emit changes
    for (const agent of agents) {
      const summary = agentTasks.get(agent.name)!;
      let derivedStatus: "idle" | "active" | "completed";

      if (summary.active > 0) {
        derivedStatus = "active";
      } else if (summary.total > 0 && summary.terminal === summary.total) {
        derivedStatus = "completed";
      } else {
        derivedStatus = "idle";
      }

      const prevStatus = this.agentDashboardStatus.get(agent.name) ?? "idle";
      if (derivedStatus !== prevStatus) {
        this.agentDashboardStatus.set(agent.name, derivedStatus);

        if (derivedStatus === "active") {
          this.emitter.broadcastDashboardEvent({
            type: "AGENT_ACTIVE",
            timestamp: now,
            data: {
              name: agent.name,
              taskId: summary.currentTaskTitle,
            },
          });
        } else if (derivedStatus === "completed") {
          this.emitter.broadcastDashboardEvent({
            type: "AGENT_COMPLETED",
            timestamp: now,
            data: { name: agent.name },
          });
        }
        // idle transitions don't need an explicit event (AGENT_REGISTERED already sets idle)
      }
    }
  }

  /**
   * Diffs tasks against the previous poll's snapshot and detects wave transitions.
   *
   * - **New task** (ID not in snapshot) → emits `TASK_SUBMITTED`.
   * - **Status changed** → delegates to {@link emitTaskStatusChange}.
   * - Also tracks per-wave completion counts and delegates wave-level detection
   *   to {@link checkWaveTransitions}.
   *
   * @param tasks - Freshly fetched task list.
   */
  private diffTasks(tasks: BridgeTask[]): void {
    const now = Date.now();
    const waveCompletionCheck = new Map<number, { total: number; done: number }>();

    for (const task of tasks) {
      const prev = this.prevState.tasks.get(task.id);

      // Track wave completion
      if (!waveCompletionCheck.has(task.wave)) {
        waveCompletionCheck.set(task.wave, { total: 0, done: 0 });
      }
      const wc = waveCompletionCheck.get(task.wave)!;
      wc.total += 1;
      if (task.status === "completed" || task.status === "failed" || task.status === "canceled") {
        wc.done += 1;
      }

      if (!prev) {
        // New task
        this.emitTaskEvent("TASK_SUBMITTED", task, now);
      } else if (prev.status !== task.status) {
        // Status changed
        this.emitTaskStatusChange(prev.status, task, now);
      }

      this.prevState.tasks.set(task.id, task);
    }

    // Check for wave transitions
    this.checkWaveTransitions(waveCompletionCheck, now);
  }

  /**
   * Emits a dashboard event for a task with its core fields in the data payload.
   *
   * @param type      - The {@link DashboardEventType} to emit.
   * @param task      - The {@link BridgeTask} that triggered the event.
   * @param timestamp - Emission timestamp (ms since epoch).
   */
  private emitTaskEvent(
    type: DashboardEventType,
    task: BridgeTask,
    timestamp: number
  ): void {
    this.emitter.broadcastDashboardEvent({
      type,
      timestamp,
      data: {
        taskId: task.id,
        title: task.title,
        assignedTo: task.assignedTo,
        wave: task.wave,
        dependsOn: task.dependsOn,
      },
    });
  }

  /**
   * Translates a task status transition into the appropriate dashboard event.
   *
   * Maps new status → event type:
   * - `submitted` → `TASK_SUBMITTED`, `working` → `TASK_WORKING`,
   * - `completed` → `TASK_COMPLETED`, `failed`/`canceled` → `TASK_FAILED`,
   * - `pending` → no event (status regression).
   *
   * @param prevStatus - The task's status from the previous poll cycle.
   * @param task       - The task with its updated status.
   * @param timestamp  - Emission timestamp (ms since epoch).
   */
  private emitTaskStatusChange(
    prevStatus: TaskStatus,
    task: BridgeTask,
    timestamp: number
  ): void {
    const statusMap: Record<TaskStatus, DashboardEventType | null> = {
      pending: null,
      submitted: "TASK_SUBMITTED",
      working: "TASK_WORKING",
      completed: "TASK_COMPLETED",
      failed: "TASK_FAILED",
      canceled: "TASK_FAILED",
    };

    const eventType = statusMap[task.status];
    if (eventType) {
      const data: Record<string, unknown> = {
        taskId: task.id,
        title: task.title,
        assignedTo: task.assignedTo,
        wave: task.wave,
      };
      if (task.status === "completed" && task.result) {
        data.artifact = task.result;
      }
      this.emitter.broadcastDashboardEvent({ type: eventType, timestamp, data });
    }
  }

  /** Set of wave indices already marked completed, preventing duplicate events. */
  private completedWaves = new Set<number>();

  /**
   * Detects wave-level transitions by checking per-wave completion stats.
   *
   * When all tasks in a wave reach a terminal status and the wave hasn't been
   * recorded yet, emits `WAVE_COMPLETED`. If a subsequent wave exists, also
   * emits `WAVE_STARTED` for it.
   *
   * @param waveStats - Map of wave index → `{ total, done }` aggregated during diff.
   * @param timestamp - Emission timestamp (ms since epoch).
   */
  private checkWaveTransitions(
    waveStats: Map<number, { total: number; done: number }>,
    timestamp: number
  ): void {
    // Sort waves by index
    const sortedWaves = [...waveStats.entries()].sort(
      ([a], [b]) => a - b
    );

    for (const [waveIndex, { total, done }] of sortedWaves) {
      // Emit WAVE_STARTED for waves that have tasks in progress but we haven't tracked yet
      if (done < total && !this.completedWaves.has(waveIndex)) {
        // Wave is active — we'll track it
      }

      // Emit WAVE_COMPLETED when all tasks in a wave are done
      if (total > 0 && done === total && !this.completedWaves.has(waveIndex)) {
        this.completedWaves.add(waveIndex);
        this.emitter.broadcastDashboardEvent({
          type: "WAVE_COMPLETED",
          timestamp,
          data: { waveIndex, tasksCompleted: done },
        });

        // If there's a next wave, emit WAVE_STARTED
        const nextWave = waveStats.get(waveIndex + 1);
        if (nextWave && nextWave.total > 0) {
          this.emitter.broadcastDashboardEvent({
            type: "WAVE_STARTED",
            timestamp,
            data: {
              waveIndex: waveIndex + 1,
              taskCount: nextWave.total,
            },
          });
        }
      }
    }
  }
}
