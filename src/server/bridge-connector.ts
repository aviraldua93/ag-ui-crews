/**
 * Bridge connector for ag-ui-crews
 * Polls a running a2a-crews bridge and translates state changes into DashboardEvents.
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

interface BridgeState {
  agents: Map<string, BridgeAgent>;
  tasks: Map<string, BridgeTask>;
  status: BridgeStatus | null;
}

export class BridgeConnector {
  private bridgeUrl: string;
  private emitter: EventEmitter;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private prevState: BridgeState = {
    agents: new Map(),
    tasks: new Map(),
    status: null,
  };

  constructor(bridgeUrl: string, emitter: EventEmitter) {
    // Normalize URL — strip trailing slash
    this.bridgeUrl = bridgeUrl.replace(/\/+$/, "");
    this.emitter = emitter;
  }

  /** Start polling the bridge */
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

    // Initial poll
    await this.poll();

    // Start polling every 2 seconds
    this.pollInterval = setInterval(() => {
      this.poll().catch((err) => {
        console.error("[bridge] Poll error:", err);
      });
    }, 2000);
  }

  /** Stop polling and disconnect */
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

  /** Whether the connector is actively polling */
  isConnected(): boolean {
    return this.connected;
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.connected) return;

    try {
      const [status, agents, tasks] = await Promise.all([
        this.fetchStatus(),
        this.fetchAgents(),
        this.fetchTasks(),
      ]);

      if (!status) return;

      // Diff agents
      this.diffAgents(agents);

      // Diff tasks and detect wave transitions
      this.diffTasks(tasks);

      // Update status metrics
      this.prevState.status = status;
    } catch (err) {
      console.error("[bridge] Poll failed:", err);
      // If bridge goes away, disconnect
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

  private async fetchStatus(): Promise<BridgeStatus | null> {
    try {
      const resp = await fetch(`${this.bridgeUrl}/status`);
      if (!resp.ok) return null;
      return (await resp.json()) as BridgeStatus;
    } catch {
      return null;
    }
  }

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

  private completedWaves = new Set<number>();

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
