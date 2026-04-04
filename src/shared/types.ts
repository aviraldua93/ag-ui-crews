/**
 * Shared types for ag-ui-crews.
 *
 * This module defines the complete data model powering the ag-ui-crews
 * dashboard — from the raw shapes returned by the a2a-crews bridge REST API,
 * through the planning and feasibility layer, to the runtime dashboard state
 * that drives both server-side reduction and client-side rendering.
 *
 * The types are organised into four sections:
 *
 * 1. **Bridge types** — Mirror the JSON shapes returned by the a2a-crews
 *    bridge's `/agents`, `/tasks`, and `/status` endpoints.
 * 2. **Dashboard state** — Runtime types consumed by the React UI and the
 *    server-side {@link EventEmitter} state reducer.
 * 3. **Server API types** — Request bodies for the `/api/connect` and
 *    `/api/simulate` endpoints.
 * 4. **Initial state constants** — Factory defaults for a clean session.
 *
 * @module shared/types
 */

// ─── a2a-crews Bridge Types ────────────────────────────────────────────────────

/**
 * Lifecycle status of a task within the a2a-crews bridge.
 *
 * Tasks progress through these statuses as the bridge dispatches them to
 * agents and agents report back.  The normal happy-path progression is:
 *
 * ```
 * pending → submitted → working → completed
 * ```
 *
 * A task may also transition to `"failed"` from `"working"`, or be
 * `"canceled"` at any point before completion.
 *
 * | Value         | Description                                                          |
 * |---------------|----------------------------------------------------------------------|
 * | `"pending"`   | Created but not yet dispatched to any agent.                         |
 * | `"submitted"` | Dispatched to an agent; awaiting acknowledgement.                    |
 * | `"working"`   | The assigned agent has acknowledged and is actively executing.       |
 * | `"completed"` | The task finished successfully; `result` may contain output.         |
 * | `"failed"`    | The task encountered an unrecoverable error.                         |
 * | `"canceled"`  | The task was canceled before reaching a terminal status.             |
 *
 * @see {@link BridgeTask.status} — the field that holds this value on bridge tasks.
 * @see {@link TaskState.status}  — the dashboard-side equivalent.
 */
export type TaskStatus =
  | "pending"
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled";

/**
 * Overall feasibility verdict for a proposed crew plan.
 *
 * Computed by the planner during the `CREW_PLAN_STARTED` → `CREW_PLAN_COMPLETED`
 * phase and embedded in {@link FeasibilityAssessment.verdict}.  The dashboard
 * uses this to surface plan confidence to the user before execution begins.
 *
 * | Value      | Description                                                            |
 * |------------|------------------------------------------------------------------------|
 * | `"go"`     | The scenario is well within the crew's capabilities.                   |
 * | `"risky"`  | The scenario is achievable but has notable concerns (see `concerns`).  |
 * | `"no-go"`  | The scenario is infeasible or too risky to attempt.                    |
 *
 * @see {@link FeasibilityAssessment} — the full assessment object that carries this verdict.
 * @see {@link CrewPlan.feasibility}  — where the assessment lives inside a plan.
 */
export type FeasibilityVerdict = "go" | "risky" | "no-go";

/**
 * An agent as reported by the a2a-crews bridge's `GET /agents` endpoint.
 *
 * This interface mirrors the JSON shape returned by the bridge and is used by
 * the {@link BridgeConnector} to detect newly registered agents and emit
 * `AGENT_REGISTERED` {@link DashboardEvent}s.
 *
 * @see {@link AgentState} — the dashboard-side runtime representation derived
 *   from this bridge data.
 * @see {@link PlanRole}   — the plan-time role definition that maps to an agent.
 *
 * @example
 * ```ts
 * const agent: BridgeAgent = {
 *   name: "backend-dev",
 *   description: "Implements API endpoints and database layer",
 *   skills: ["typescript", "node", "postgres"],
 *   registeredAt: "2025-06-01T12:00:00Z",
 *   lastHeartbeat: "2025-06-01T12:05:00Z",
 * };
 * ```
 */
export interface BridgeAgent {
  /** Unique agent name, matching the {@link PlanRole.key} assigned during planning. */
  name: string;
  /** Human-readable description of the agent's role and capabilities. */
  description: string;
  /** List of skill tags the agent declared at registration time (e.g. `["typescript", "react"]`). */
  skills: string[];
  /** ISO 8601 timestamp when the agent first registered with the bridge. */
  registeredAt: string;
  /** ISO 8601 timestamp of the agent's most recent heartbeat, or `undefined` if no heartbeat received yet. */
  lastHeartbeat?: string;
}

/**
 * A task as reported by the a2a-crews bridge's `GET /tasks` endpoint.
 *
 * This interface mirrors the JSON shape returned by the bridge.  The
 * {@link BridgeConnector} polls for tasks and compares their `status` field
 * against previously seen values to emit `TASK_SUBMITTED`, `TASK_WORKING`,
 * `TASK_COMPLETED`, and `TASK_FAILED` {@link DashboardEvent}s.
 *
 * @see {@link TaskState} — the dashboard-side runtime representation.
 * @see {@link PlanTask}  — the plan-time definition from which bridge tasks originate.
 *
 * @example
 * ```ts
 * const task: BridgeTask = {
 *   id: "implement-api",
 *   title: "Implement REST API with auth",
 *   assignedTo: "backend-dev",
 *   status: "working",
 *   dependsOn: ["design"],
 *   wave: 1,
 *   createdAt: "2025-06-01T12:01:00Z",
 *   updatedAt: "2025-06-01T12:03:00Z",
 * };
 * ```
 */
export interface BridgeTask {
  /** Unique task identifier, matching the {@link PlanTask.id} from the crew plan. */
  id: string;
  /** Short human-readable title describing the task. */
  title: string;
  /** Name of the agent assigned to execute this task (matches {@link BridgeAgent.name}). */
  assignedTo: string;
  /** Current lifecycle status of the task. */
  status: TaskStatus;
  /** IDs of prerequisite tasks that must complete before this task can start. */
  dependsOn: string[];
  /** Zero-based wave index this task belongs to (determines parallel execution group). */
  wave: number;
  /** Textual result or output produced by the agent upon task completion, or `undefined` if not yet completed. */
  result?: string;
  /** ISO 8601 timestamp when the task was created on the bridge. */
  createdAt: string;
  /** ISO 8601 timestamp of the most recent status change. */
  updatedAt: string;
}

/**
 * Aggregate status summary from the a2a-crews bridge's `GET /status` endpoint.
 *
 * Provides a high-level overview of the bridge's current state — how many
 * agents are connected and a breakdown of task counts by status.  The
 * {@link BridgeConnector} uses this to detect when the bridge first becomes
 * available and to populate `METRICS_UPDATE` events.
 *
 * @see {@link CrewMetrics} — the dashboard-side metrics derived from this data.
 *
 * @example
 * ```ts
 * const status: BridgeStatus = {
 *   agents: 4,
 *   tasks: { total: 8, submitted: 1, working: 2, completed: 3, failed: 1, canceled: 1 },
 *   uptime: 120000,
 * };
 * ```
 */
export interface BridgeStatus {
  /** Agent counts (summary from bridge). */
  agents: number | { total: number; online?: number; busy?: number; idle?: number; offline?: number };
  /** Breakdown of task counts by {@link TaskStatus}. */
  tasks: {
    /** Total number of tasks across all statuses. */
    total: number;
    /** Tasks dispatched to an agent but not yet acknowledged. */
    submitted: number;
    /** Tasks actively being executed by an agent. */
    working: number;
    /** Tasks that finished successfully. */
    completed: number;
    /** Tasks that failed fatally. */
    failed: number;
    /** Tasks that were canceled before completion. */
    canceled: number;
  };
  /** Bridge process uptime in milliseconds. */
  uptime: number;
}

/**
 * Feasibility assessment produced by the planner during the planning phase.
 *
 * Evaluates whether the proposed scenario is achievable given the available
 * agent capabilities.  The `verdict` field gives the top-level go/no-go
 * decision, while the numeric scores provide more granular insight.
 *
 * All numeric scores (`confidence`, `technical`, `scope`, `risk`) are
 * normalized to the **0–1** range where higher is "better" (more confident,
 * more technically feasible, more scope-appropriate, lower risk).
 *
 * @see {@link CrewPlan.feasibility} — where this assessment is embedded.
 * @see {@link FeasibilityVerdict}   — the possible verdict values.
 *
 * @example
 * ```ts
 * const assessment: FeasibilityAssessment = {
 *   verdict: "go",
 *   confidence: 0.92,
 *   concerns: [],
 *   technical: 0.95,
 *   scope: 0.88,
 *   risk: 0.85,
 * };
 * ```
 */
export interface FeasibilityAssessment {
  /** Top-level feasibility verdict for the scenario. */
  verdict: FeasibilityVerdict;
  /** Overall confidence score (0–1) that the crew can complete the scenario. */
  confidence: number;
  /** List of human-readable concerns identified during analysis (empty if none). */
  concerns: string[];
  /** Technical feasibility score (0–1); higher means more technically achievable. */
  technical: number;
  /** Scope appropriateness score (0–1); higher means the scope is well-sized. */
  scope: number;
  /** Risk score (0–1); higher means *lower* risk (inverted — 1 = safest). */
  risk: number;
}

/**
 * A role definition within a {@link CrewPlan}.
 *
 * Each role maps to one agent in the crew.  During execution, an agent is
 * registered with the bridge using the role's `key` as its name, and
 * assigned tasks whose `assignedTo` matches that key.
 *
 * @see {@link CrewPlan.roles}  — the array that holds these definitions.
 * @see {@link AgentState}      — the runtime agent state derived from a role.
 * @see {@link BridgeAgent}     — the bridge-side registration record.
 *
 * @example
 * ```ts
 * const role: PlanRole = {
 *   key: "backend-dev",
 *   description: "Implements API endpoints and database layer",
 *   model: "gpt-4o",
 * };
 * ```
 */
export interface PlanRole {
  /** Unique role key used as the agent name during execution (e.g. `"backend-dev"`). */
  key: string;
  /** Human-readable description of the role's responsibilities. */
  description: string;
  /** Optional LLM model identifier to use for this agent (e.g. `"gpt-4o"`). */
  model?: string;
}

/**
 * A task definition within a {@link CrewPlan}.
 *
 * Plan tasks are the static, pre-execution definitions.  At runtime they are
 * expanded into {@link TaskState} objects (with additional fields like
 * `startedAt` and `retryCount`) and submitted to the bridge as
 * {@link BridgeTask}s.
 *
 * @see {@link CrewPlan.tasks}  — the flat list of all plan tasks.
 * @see {@link CrewPlan.waves}  — tasks grouped by execution wave.
 * @see {@link TaskState}       — the runtime state derived from a plan task.
 * @see {@link BridgeTask}      — the bridge-side task record.
 *
 * @example
 * ```ts
 * const task: PlanTask = {
 *   id: "implement-api",
 *   title: "Implement REST API with auth",
 *   assignedTo: "backend-dev",
 *   dependsOn: ["design"],
 *   acceptanceCriteria: ["All endpoints return JSON", "Auth middleware validates JWT"],
 * };
 * ```
 */
export interface PlanTask {
  /** Unique task identifier referenced by {@link PlanTask.dependsOn} in downstream tasks. */
  id: string;
  /** Short human-readable title describing the task. */
  title: string;
  /** {@link PlanRole.key} of the agent that will execute this task. */
  assignedTo: string;
  /** IDs of prerequisite tasks that must complete before this task can start. */
  dependsOn: string[];
  /** Optional list of acceptance criteria the agent should satisfy (used for validation). */
  acceptanceCriteria?: string[];
}

/**
 * The complete crew execution plan produced by the planner.
 *
 * A `CrewPlan` is the output of the planning phase and the input to execution.
 * It describes the scenario, a feasibility assessment, the roles (agents),
 * and the tasks organised both as a flat list and as dependency-ordered waves.
 *
 * On the server, the simulator or bridge-connector emits this inside a
 * `CREW_PLAN_COMPLETED` {@link DashboardEvent}.  On the client, it is stored
 * in {@link DashboardState.plan} and used to render the plan summary panel.
 *
 * @see {@link DashboardState.plan}     — where the plan is stored at runtime.
 * @see {@link FeasibilityAssessment}   — the embedded feasibility analysis.
 * @see {@link PlanRole}                — individual role definitions.
 * @see {@link PlanTask}                — individual task definitions.
 *
 * @example
 * ```ts
 * const plan: CrewPlan = {
 *   scenario: "Build a REST API with auth and tests",
 *   feasibility: { verdict: "go", confidence: 0.92, concerns: [], technical: 0.95, scope: 0.88, risk: 0.85 },
 *   roles: [{ key: "backend-dev", description: "Implements API" }],
 *   tasks: [{ id: "impl", title: "Implement API", assignedTo: "backend-dev", dependsOn: [] }],
 *   waves: [[{ id: "impl", title: "Implement API", assignedTo: "backend-dev", dependsOn: [] }]],
 * };
 * ```
 */
export interface CrewPlan {
  /** Natural-language description of the project scenario being executed. */
  scenario: string;
  /** Optional template name used to generate the plan (e.g. `"rest-api"`). */
  template?: string;
  /** Feasibility assessment computed by the planner for this scenario. */
  feasibility: FeasibilityAssessment;
  /** Ordered list of roles (agents) participating in the crew. */
  roles: PlanRole[];
  /** Flat list of all tasks in the plan. */
  tasks: PlanTask[];
  /**
   * Tasks grouped into dependency-ordered execution waves.
   *
   * Each inner array represents a wave of tasks that can run in parallel
   * (all their `dependsOn` prerequisites belong to earlier waves).
   * `waves[0]` executes first, then `waves[1]`, etc.
   */
  waves: PlanTask[][];
}

// ─── Dashboard State ───────────────────────────────────────────────────────────

/**
 * High-level phase of the dashboard lifecycle.
 *
 * The phase drives top-level UI transitions (e.g. showing the connection
 * form vs. the execution timeline).  It progresses linearly under normal
 * operation:
 *
 * ```
 * idle → connecting → planning → executing → completed
 *                                           ↘ error
 * ```
 *
 * @see {@link DashboardState.phase} — the state field that holds this value.
 *
 * | Value          | Description                                                   |
 * |----------------|---------------------------------------------------------------|
 * | `"idle"`         | No session active; waiting for user to connect or simulate.   |
 * | `"connecting"`   | Connecting to a live a2a-crews bridge.                        |
 * | `"planning"`     | Planner is evaluating feasibility and generating the plan.    |
 * | `"executing"`    | Waves and tasks are actively being processed by agents.       |
 * | `"completed"`    | All waves finished successfully.                              |
 * | `"error"`        | An unrecoverable error halted the session.                    |
 */
export type DashboardPhase =
  | "idle"
  | "connecting"
  | "planning"
  | "executing"
  | "completed"
  | "error";

/**
 * Represents the runtime state of a single agent during execution.
 *
 * Initialized when an `AGENT_REGISTERED` {@link DashboardEvent} fires, then
 * updated by `AGENT_ACTIVE`, `AGENT_COMPLETED`, `AGENT_FAILED`, and
 * `AGENT_RETRYING` events.  The `useCrewState` hook groups agents by
 * status for the dashboard's agent panel.
 *
 * @see {@link BridgeAgent}           — the bridge-side source data.
 * @see {@link DashboardState.agents} — the array that holds these records.
 *
 * @example
 * ```ts
 * const agent: AgentState = {
 *   name: "backend-dev",
 *   role: "Implements API endpoints",
 *   status: "active",
 *   currentTask: "implement-api",
 *   startedAt: 1717243200000,
 *   retryCount: 0,
 * };
 * ```
 */
export interface AgentState {
  /** Unique agent name, matching the {@link PlanRole.key} from the plan. */
  name: string;
  /** Human-readable role description from {@link PlanRole.description}. */
  role: string;
  /**
   * Current agent lifecycle status.
   *
   * - `"idle"`      — Registered but not yet assigned work.
   * - `"active"`    — Currently executing a task.
   * - `"completed"` — All assigned tasks finished successfully.
   * - `"failed"`    — The agent's current task failed fatally.
   * - `"retrying"`  — The agent is retrying a previously failed task.
   */
  status: "idle" | "active" | "completed" | "failed" | "retrying";
  /** ID of the task the agent is currently working on, if any. */
  currentTask?: string;
  /** Unix timestamp (ms) when the agent became active, or `undefined` if still idle. */
  startedAt?: number;
  /** Unix timestamp (ms) when the agent reached a terminal status, or `undefined` if still running. */
  completedAt?: number;
  /** Number of times this agent has retried a failed task. */
  retryCount: number;
}

/**
 * Runtime state of a single execution wave.
 *
 * Waves group tasks that can run in parallel (i.e. all their dependencies
 * are satisfied).  The EventEmitter creates these from {@link CrewPlan.waves}
 * when `CREW_PLAN_COMPLETED` fires, then transitions them through
 * `WAVE_STARTED` → `WAVE_COMPLETED` (or `WAVE_FAILED`).
 *
 * @see {@link CrewPlan.waves}       — the plan-time wave definitions.
 * @see {@link DashboardState.waves} — the array that holds these records.
 *
 * @example
 * ```ts
 * const wave: WaveState = {
 *   index: 0,
 *   status: "active",
 *   tasks: [taskState1, taskState2],
 *   startedAt: 1717243260000,
 * };
 * ```
 */
export interface WaveState {
  /** Zero-based wave index corresponding to the position in {@link CrewPlan.waves}. */
  index: number;
  /**
   * Current wave lifecycle status.
   *
   * - `"pending"`   — Wave has not started yet (prior waves still running).
   * - `"active"`    — Wave is currently executing; tasks are in flight.
   * - `"completed"` — All tasks in the wave finished successfully.
   * - `"failed"`    — One or more tasks in the wave failed.
   */
  status: "pending" | "active" | "completed" | "failed";
  /** The tasks belonging to this wave, with their current runtime state. */
  tasks: TaskState[];
  /** Unix timestamp (ms) when the wave started executing, or `undefined` if still pending. */
  startedAt?: number;
  /** Unix timestamp (ms) when the wave reached a terminal status, or `undefined` if still active. */
  completedAt?: number;
}

/**
 * Runtime state of a single task during execution.
 *
 * Mirrors the essential fields of {@link BridgeTask} plus dashboard-specific
 * runtime data (`startedAt`, `completedAt`, `retryCount`, `artifact`).
 * These records are created from {@link PlanTask} when `CREW_PLAN_COMPLETED`
 * fires, and updated by `TASK_SUBMITTED`, `TASK_WORKING`, `TASK_COMPLETED`,
 * `TASK_FAILED`, `TASK_RETRYING`, and `ARTIFACT_PRODUCED` events.
 *
 * @see {@link BridgeTask}           — the bridge-side source data.
 * @see {@link PlanTask}             — the plan-time definition.
 * @see {@link DashboardState.tasks} — the flat array that holds these records.
 * @see {@link WaveState.tasks}      — the per-wave grouping.
 *
 * @example
 * ```ts
 * const task: TaskState = {
 *   id: "implement-api",
 *   title: "Implement REST API with auth",
 *   assignedTo: "backend-dev",
 *   status: "working",
 *   wave: 1,
 *   dependsOn: ["design"],
 *   startedAt: 1717243260000,
 *   retryCount: 0,
 * };
 * ```
 */
export interface TaskState {
  /** Unique task identifier, matching {@link PlanTask.id}. */
  id: string;
  /** Short human-readable title of the task. */
  title: string;
  /** Name of the agent executing this task (matches {@link AgentState.name}). */
  assignedTo: string;
  /** Current lifecycle status of the task. */
  status: TaskStatus;
  /** Zero-based wave index this task belongs to. */
  wave: number;
  /** IDs of prerequisite tasks that must complete first. */
  dependsOn: string[];
  /** Unix timestamp (ms) when the task transitioned to `"working"`, or `undefined`. */
  startedAt?: number;
  /** Unix timestamp (ms) when the task reached a terminal status, or `undefined`. */
  completedAt?: number;
  /** Filename of the artifact produced by this task, if any. */
  artifact?: string;
  /** Number of times this task has been retried after failure. */
  retryCount: number;
}

/**
 * An artifact produced by an agent upon task completion.
 *
 * Artifacts are emitted via `ARTIFACT_PRODUCED` {@link DashboardEvent}s and
 * stored in {@link DashboardState.artifacts}.  The `ArtifactViewer` client
 * component renders these as downloadable / previewable files.
 *
 * @see {@link DashboardState.artifacts} — the array that holds these records.
 *
 * @example
 * ```ts
 * const artifact: Artifact = {
 *   taskId: "implement-api",
 *   filename: "api-routes.ts",
 *   content: "export const router = ...",
 *   producedBy: "backend-dev",
 *   producedAt: 1717243320000,
 * };
 * ```
 */
export interface Artifact {
  /** ID of the {@link TaskState} that produced this artifact. */
  taskId: string;
  /** Filename (or path) of the artifact (e.g. `"api-routes.ts"`). */
  filename: string;
  /** Full text content of the artifact. */
  content: string;
  /** Name of the agent that produced the artifact (matches {@link AgentState.name}). */
  producedBy: string;
  /** Unix timestamp (ms) when the artifact was produced. */
  producedAt: number;
}

/**
 * Aggregate execution metrics for the entire crew run.
 *
 * Updated incrementally by `METRICS_UPDATE` {@link DashboardEvent}s and
 * displayed in the `MetricsBar` client component.  Reset to
 * {@link INITIAL_METRICS} when a new session starts.
 *
 * @see {@link DashboardState.metrics} — the state field that holds this object.
 * @see {@link INITIAL_METRICS}        — the zero-valued factory default.
 *
 * @example
 * ```ts
 * const metrics: CrewMetrics = {
 *   totalTime: 45200,   // 45.2 seconds elapsed
 *   waveCount: 3,
 *   taskCount: 8,
 *   completedTasks: 7,
 *   failedTasks: 1,
 *   retryCount: 1,
 *   agentCount: 4,
 * };
 * ```
 */
export interface CrewMetrics {
  /** Wall-clock elapsed time of the run in milliseconds. */
  totalTime: number;
  /** Total number of execution waves in the plan. */
  waveCount: number;
  /** Total number of tasks across all waves. */
  taskCount: number;
  /** Number of tasks that have completed successfully so far. */
  completedTasks: number;
  /** Number of tasks that have failed (including those later retried). */
  failedTasks: number;
  /** Cumulative number of task retries across all agents. */
  retryCount: number;
  /** Number of agents that participated in the run. */
  agentCount: number;
}

/**
 * The canonical top-level state tree for the ag-ui-crews dashboard.
 *
 * This is the single source of truth consumed by all React components.  On
 * the server side, {@link EventEmitter} maintains an instance and reduces
 * incoming {@link DashboardEvent}s into it.  On the client side, the
 * `useEventStream` hook maintains a local copy via a React reducer that
 * processes AG-UI events received over SSE.
 *
 * The state is initialized to {@link INITIAL_DASHBOARD_STATE} at startup and
 * whenever a session is reset.
 *
 * @see {@link INITIAL_DASHBOARD_STATE} — the factory default.
 * @see {@link DashboardEvent}          — the event type that mutates this state.
 *
 * @example
 * ```ts
 * const state: DashboardState = {
 *   phase: "executing",
 *   bridgeUrl: "http://localhost:62638",
 *   plan: crewPlan,
 *   agents: [agentState],
 *   waves: [waveState],
 *   tasks: [taskState],
 *   artifacts: [],
 *   metrics: { totalTime: 12000, waveCount: 2, taskCount: 5, completedTasks: 2, failedTasks: 0, retryCount: 0, agentCount: 3 },
 *   eventLog: [dashboardEvent],
 *   error: null,
 *   startedAt: 1717243200000,
 * };
 * ```
 */
export interface DashboardState {
  /** Current high-level phase of the dashboard lifecycle. */
  phase: DashboardPhase;
  /** URL of the connected a2a-crews bridge, or `null` when using the simulator. */
  bridgeUrl: string | null;
  /** The crew execution plan, or `null` before planning completes. */
  plan: CrewPlan | null;
  /** Current state of every registered agent. */
  agents: AgentState[];
  /** Current state of every execution wave. */
  waves: WaveState[];
  /** Flat list of all task states (also nested inside {@link WaveState.tasks}). */
  tasks: TaskState[];
  /** Artifacts produced by agents during execution. */
  artifacts: Artifact[];
  /** Aggregate execution metrics for the current run. */
  metrics: CrewMetrics;
  /** Chronological log of all {@link DashboardEvent}s received during the session. */
  eventLog: DashboardEvent[];
  /** Human-readable error message, or `null` when no error has occurred. */
  error: string | null;
  /** Unix timestamp (ms) when the current session started, or `null` if idle. */
  startedAt: number | null;
}

// ─── AG-UI Event Types (Dashboard-specific) ────────────────────────────────────

/**
 * Discriminated-union tag for {@link DashboardEvent}s.
 *
 * Every dashboard event carries one of these types, which the state reducer
 * in both `EventEmitter.applyEvent()` (server) and the `useEventStream`
 * hook (client) uses as the switch discriminant.  The types are grouped by
 * subsystem:
 *
 * **Planning events:**
 * - `"CREW_PLAN_STARTED"`    — Planner has begun evaluating the scenario.
 * - `"CREW_PLAN_COMPLETED"`  — Plan is ready; carries the full {@link CrewPlan}.
 * - `"CREW_PLAN_FAILED"`     — Planning failed (e.g. infeasible scenario).
 *
 * **Wave events:**
 * - `"WAVE_STARTED"`     — A wave of parallel tasks has begun execution.
 * - `"WAVE_COMPLETED"`   — All tasks in the wave finished successfully.
 * - `"WAVE_FAILED"`      — One or more tasks in the wave failed.
 *
 * **Agent events:**
 * - `"AGENT_REGISTERED"` — A new agent registered with the bridge/simulator.
 * - `"AGENT_ACTIVE"`     — An agent started working on a task.
 * - `"AGENT_COMPLETED"`  — An agent finished all assigned tasks.
 * - `"AGENT_FAILED"`     — An agent encountered an unrecoverable error.
 * - `"AGENT_RETRYING"`   — An agent is retrying a previously failed task.
 *
 * **Task events:**
 * - `"TASK_SUBMITTED"`  — A task has been queued for execution.
 * - `"TASK_WORKING"`    — An agent has picked up the task.
 * - `"TASK_COMPLETED"`  — The task finished successfully.
 * - `"TASK_FAILED"`     — The task failed.
 * - `"TASK_RETRYING"`   — The task is being retried.
 *
 * **Artifact events:**
 * - `"ARTIFACT_PRODUCED"` — An agent produced an output artifact.
 *
 * **Infrastructure events:**
 * - `"BRIDGE_CONNECTED"`    — Successfully connected to a live bridge.
 * - `"BRIDGE_DISCONNECTED"` — Lost connection to the live bridge.
 * - `"METRICS_UPDATE"`      — Updated aggregate {@link CrewMetrics}.
 * - `"STATE_SNAPSHOT"`      — Full state snapshot for late-joining clients.
 *
 * @see {@link DashboardEvent} — the event envelope that carries this type.
 * @see {@link translateToAgUi} in `events.ts` — maps these to AG-UI protocol events.
 */
export type DashboardEventType =
  | "CREW_PLAN_STARTED"
  | "CREW_PLAN_COMPLETED"
  | "CREW_PLAN_FAILED"
  | "WAVE_STARTED"
  | "WAVE_COMPLETED"
  | "WAVE_FAILED"
  | "AGENT_REGISTERED"
  | "AGENT_ACTIVE"
  | "AGENT_COMPLETED"
  | "AGENT_FAILED"
  | "AGENT_RETRYING"
  | "TASK_SUBMITTED"
  | "TASK_WORKING"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_RETRYING"
  | "ARTIFACT_PRODUCED"
  | "BRIDGE_CONNECTED"
  | "BRIDGE_DISCONNECTED"
  | "METRICS_UPDATE"
  | "STATE_SNAPSHOT";

/**
 * A single event emitted during a crew execution session.
 *
 * Dashboard events are the internal event bus of the system.  They are:
 * 1. Produced by the simulator or bridge-connector.
 * 2. Applied to the server-side {@link DashboardState} by
 *    `EventEmitter.applyEvent()`.
 * 3. Translated into AG-UI protocol events by {@link translateToAgUi}
 *    in `events.ts`.
 * 4. Streamed to clients over SSE.
 * 5. Applied to the client-side state by the `useEventStream` reducer.
 *
 * Each event is also appended to {@link DashboardState.eventLog} for the
 * scrollable event log UI.
 *
 * @see {@link DashboardEventType} — the discriminant values.
 * @see {@link DashboardState.eventLog} — where events accumulate.
 *
 * @example
 * ```ts
 * const event: DashboardEvent = {
 *   type: "TASK_COMPLETED",
 *   timestamp: 1717243320000,
 *   data: { taskId: "implement-api", assignedTo: "backend-dev", title: "Implement REST API" },
 * };
 * ```
 */
export interface DashboardEvent {
  /** The event type tag, used as the switch discriminant in state reducers. */
  type: DashboardEventType;
  /** Unix timestamp (ms) when the event was produced. */
  timestamp: number;
  /**
   * Payload data specific to the event type.  The shape varies by
   * {@link DashboardEventType} — e.g. `TASK_COMPLETED` carries `taskId`,
   * `assignedTo`, and `title`, while `WAVE_STARTED` carries `waveIndex`
   * and `taskCount`.
   */
  data: Record<string, unknown>;
}

// ─── Server API Types ──────────────────────────────────────────────────────────

/**
 * Request body for the `POST /api/connect` endpoint.
 *
 * Instructs the server to start polling a live a2a-crews bridge for status
 * and task updates.  The bridge-connector will begin emitting
 * {@link DashboardEvent}s derived from the bridge's REST API responses.
 *
 * @see {@link SimulationConfig} — the alternative for local simulation mode.
 *
 * @example
 * ```ts
 * // Client-side fetch call:
 * await fetch("/api/connect", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ bridgeUrl: "http://localhost:62638" } satisfies ConnectRequest),
 * });
 * ```
 */
export interface ConnectRequest {
  /** Fully-qualified URL of the a2a-crews bridge (e.g. `"http://localhost:62638"`). */
  bridgeUrl: string;
}

/**
 * Request body for the `POST /api/simulate` endpoint.
 *
 * Starts a local simulation that generates synthetic {@link DashboardEvent}s
 * without requiring a live a2a-crews bridge.  All fields except `scenario`
 * are optional and fall back to sensible defaults.
 *
 * @see {@link ConnectRequest} — the alternative for live bridge mode.
 *
 * @example
 * ```ts
 * const config: SimulationConfig = {
 *   scenario: "Build a REST API with auth and tests",
 *   agentCount: 4,
 *   waveCount: 3,
 *   failureRate: 0.1,
 *   speedMultiplier: 2,
 * };
 * ```
 */
export interface SimulationConfig {
  /** Natural-language description of the project scenario to simulate. */
  scenario: string;
  /**
   * Number of agents to include in the simulated crew.
   * Defaults to a scenario-appropriate value when omitted.
   */
  agentCount?: number;
  /**
   * Number of execution waves to generate.
   * Defaults to a scenario-appropriate value when omitted.
   */
  waveCount?: number;
  /**
   * Probability (0–1) that any given task will fail on its first attempt.
   * `0` means no failures; `1` means every task fails initially.
   * Defaults to a low value when omitted.
   */
  failureRate?: number;
  /**
   * Multiplier applied to simulated delays between events.
   * `1` is real-time, `2` is twice as fast, `0.5` is half speed.
   * Defaults to `1` when omitted.
   */
  speedMultiplier?: number;
}

// ─── Initial State ─────────────────────────────────────────────────────────────

/**
 * Factory-default metrics with all counters at zero.
 *
 * Used as the initial value for {@link DashboardState.metrics} and by
 * `EventEmitter.reset()` to restore the metrics to a clean slate when a
 * new session begins.  Spread into a fresh object before use to avoid
 * mutating the constant.
 *
 * @see {@link CrewMetrics}             — the interface this constant satisfies.
 * @see {@link INITIAL_DASHBOARD_STATE} — the full state constant that embeds a
 *   spread copy of this object.
 *
 * @example
 * ```ts
 * // Reset metrics for a new session:
 * state.metrics = { ...INITIAL_METRICS };
 * ```
 */
export const INITIAL_METRICS: CrewMetrics = {
  totalTime: 0,
  waveCount: 0,
  taskCount: 0,
  completedTasks: 0,
  failedTasks: 0,
  retryCount: 0,
  agentCount: 0,
};

/**
 * Factory-default dashboard state representing a fresh, idle session.
 *
 * Used as:
 * - The initial state for the server-side `EventEmitter` on startup.
 * - The reset target when `EventEmitter.reset()` is called between sessions.
 * - The initial value for the client-side `useEventStream` React reducer.
 *
 * All collections are empty, all nullable fields are `null`, and the phase
 * is `"idle"`.  The embedded `metrics` field is a spread copy of
 * {@link INITIAL_METRICS}.
 *
 * @see {@link DashboardState}  — the interface this constant satisfies.
 * @see {@link INITIAL_METRICS} — the zero-valued metrics embedded here.
 *
 * @example
 * ```ts
 * // In a React reducer:
 * function reducer(state: DashboardState, action: Action): DashboardState {
 *   if (action.type === "RESET") return { ...INITIAL_DASHBOARD_STATE };
 *   // ...
 * }
 * ```
 */
export const INITIAL_DASHBOARD_STATE: DashboardState = {
  phase: "idle",
  bridgeUrl: null,
  plan: null,
  agents: [],
  waves: [],
  tasks: [],
  artifacts: [],
  metrics: { ...INITIAL_METRICS },
  eventLog: [],
  error: null,
  startedAt: null,
};
