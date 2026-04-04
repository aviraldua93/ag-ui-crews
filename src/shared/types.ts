/**
 * Shared types for ag-ui-crews
 * Defines the data model for crew planning, execution, and AG-UI event translation
 */

// ─── a2a-crews Bridge Types ────────────────────────────────────────────────────

export type TaskStatus =
  | "pending"
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled";

export type FeasibilityVerdict = "go" | "risky" | "no-go";

export interface BridgeAgent {
  name: string;
  description: string;
  skills: string[];
  registeredAt: string;
  lastHeartbeat?: string;
}

export interface BridgeTask {
  id: string;
  title: string;
  assignedTo: string;
  status: TaskStatus;
  dependsOn: string[];
  wave: number;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BridgeStatus {
  agents: number;
  tasks: {
    total: number;
    submitted: number;
    working: number;
    completed: number;
    failed: number;
    canceled: number;
  };
  uptime: number;
}

export interface FeasibilityAssessment {
  verdict: FeasibilityVerdict;
  confidence: number;
  concerns: string[];
  technical: number;
  scope: number;
  risk: number;
}

export interface PlanRole {
  key: string;
  description: string;
  model?: string;
}

export interface PlanTask {
  id: string;
  title: string;
  assignedTo: string;
  dependsOn: string[];
  acceptanceCriteria?: string[];
}

export interface CrewPlan {
  scenario: string;
  template?: string;
  feasibility: FeasibilityAssessment;
  roles: PlanRole[];
  tasks: PlanTask[];
  waves: PlanTask[][];
}

// ─── Dashboard State ───────────────────────────────────────────────────────────

export type DashboardPhase =
  | "idle"
  | "connecting"
  | "planning"
  | "executing"
  | "completed"
  | "error";

export interface AgentState {
  name: string;
  role: string;
  status: "idle" | "active" | "completed" | "failed" | "retrying";
  currentTask?: string;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
}

export interface WaveState {
  index: number;
  status: "pending" | "active" | "completed" | "failed";
  tasks: TaskState[];
  startedAt?: number;
  completedAt?: number;
}

export interface TaskState {
  id: string;
  title: string;
  assignedTo: string;
  status: TaskStatus;
  wave: number;
  dependsOn: string[];
  startedAt?: number;
  completedAt?: number;
  artifact?: string;
  retryCount: number;
}

export interface Artifact {
  taskId: string;
  filename: string;
  content: string;
  producedBy: string;
  producedAt: number;
}

export interface CrewMetrics {
  totalTime: number;
  waveCount: number;
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  retryCount: number;
  agentCount: number;
}

export interface DashboardState {
  phase: DashboardPhase;
  bridgeUrl: string | null;
  plan: CrewPlan | null;
  agents: AgentState[];
  waves: WaveState[];
  tasks: TaskState[];
  artifacts: Artifact[];
  metrics: CrewMetrics;
  eventLog: DashboardEvent[];
  error: string | null;
  startedAt: number | null;
}

// ─── AG-UI Event Types (Dashboard-specific) ────────────────────────────────────

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

export interface DashboardEvent {
  type: DashboardEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Server API Types ──────────────────────────────────────────────────────────

export interface ConnectRequest {
  bridgeUrl: string;
}

export interface SimulationConfig {
  scenario: string;
  agentCount?: number;
  waveCount?: number;
  failureRate?: number;
  speedMultiplier?: number;
}

// ─── Initial State ─────────────────────────────────────────────────────────────

export const INITIAL_METRICS: CrewMetrics = {
  totalTime: 0,
  waveCount: 0,
  taskCount: 0,
  completedTasks: 0,
  failedTasks: 0,
  retryCount: 0,
  agentCount: 0,
};

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
