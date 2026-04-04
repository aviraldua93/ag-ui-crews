/**
 * AG-UI event helpers for ag-ui-crews
 * Translates dashboard events into AG-UI protocol format for SSE streaming
 */
import type {
  DashboardEvent,
  DashboardEventType,
  DashboardState,
} from "./types";
import { v4 as uuidv4 } from "uuid";

// AG-UI EventType enum values we use (matching @ag-ui/core)
export const AG_UI_EVENT_TYPES = {
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  RUN_ERROR: "RUN_ERROR",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",
  TEXT_MESSAGE_START: "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT: "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END: "TEXT_MESSAGE_END",
  STATE_SNAPSHOT: "STATE_SNAPSHOT",
  STATE_DELTA: "STATE_DELTA",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  CUSTOM: "CUSTOM",
} as const;

export type AgUiEventType =
  (typeof AG_UI_EVENT_TYPES)[keyof typeof AG_UI_EVENT_TYPES];

export interface AgUiEvent {
  type: AgUiEventType;
  timestamp: number;
  [key: string]: unknown;
}

/** Create a run-started event */
export function runStarted(threadId: string, runId: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  };
}

/** Create a run-finished event */
export function runFinished(threadId: string, runId: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.RUN_FINISHED,
    threadId,
    runId,
    timestamp: Date.now(),
  };
}

/** Create a run-error event */
export function runError(message: string, code?: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.RUN_ERROR,
    message,
    code,
    timestamp: Date.now(),
  };
}

/** Create a step-started event */
export function stepStarted(stepName: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STEP_STARTED,
    stepName,
    timestamp: Date.now(),
  };
}

/** Create a step-finished event */
export function stepFinished(stepName: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STEP_FINISHED,
    stepName,
    timestamp: Date.now(),
  };
}

/** Create a text message streaming triad */
export function textMessage(
  content: string,
  role: string = "assistant"
): AgUiEvent[] {
  const messageId = uuidv4();
  return [
    {
      type: AG_UI_EVENT_TYPES.TEXT_MESSAGE_START,
      messageId,
      role,
      timestamp: Date.now(),
    },
    {
      type: AG_UI_EVENT_TYPES.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: content,
      timestamp: Date.now(),
    },
    {
      type: AG_UI_EVENT_TYPES.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    },
  ];
}

/** Create a state snapshot event */
export function stateSnapshot(state: DashboardState): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STATE_SNAPSHOT,
    snapshot: state,
    timestamp: Date.now(),
  };
}

/** Create a state delta event (JSON Patch) */
export function stateDelta(
  operations: Array<{ op: string; path: string; value?: unknown }>
): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STATE_DELTA,
    delta: operations,
    timestamp: Date.now(),
  };
}

/** Create a custom event wrapping a dashboard-specific event */
export function customEvent(dashboardEvent: DashboardEvent): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.CUSTOM,
    name: dashboardEvent.type,
    value: dashboardEvent.data,
    timestamp: dashboardEvent.timestamp,
  };
}

/** Translate a dashboard event into one or more AG-UI events */
export function translateToAgUi(event: DashboardEvent): AgUiEvent[] {
  const events: AgUiEvent[] = [];

  switch (event.type) {
    case "CREW_PLAN_STARTED":
      events.push(stepStarted("planning"));
      events.push(...textMessage("🔍 Planning crew..."));
      break;

    case "CREW_PLAN_COMPLETED":
      events.push(stepFinished("planning"));
      events.push(
        ...textMessage(
          `✅ Plan ready — ${(event.data.roleCount as number) ?? 0} roles, ${(event.data.taskCount as number) ?? 0} tasks`
        )
      );
      break;

    case "WAVE_STARTED":
      events.push(stepStarted(`wave-${event.data.waveIndex}`));
      events.push(
        ...textMessage(
          `🌊 Wave ${(event.data.waveIndex as number) + 1} started — ${event.data.taskCount} tasks in parallel`
        )
      );
      break;

    case "WAVE_COMPLETED":
      events.push(stepFinished(`wave-${event.data.waveIndex}`));
      break;

    case "AGENT_REGISTERED":
      events.push(
        ...textMessage(`🤖 Agent registered: ${event.data.name}`)
      );
      break;

    case "TASK_WORKING":
      events.push(
        ...textMessage(
          `⚙️ ${event.data.assignedTo} working on: ${event.data.title}`
        )
      );
      break;

    case "TASK_COMPLETED":
      events.push(
        ...textMessage(
          `✅ ${event.data.assignedTo} completed: ${event.data.title}`
        )
      );
      break;

    case "TASK_FAILED":
      events.push(
        ...textMessage(
          `❌ ${event.data.assignedTo} failed: ${event.data.title}`
        )
      );
      break;

    case "ARTIFACT_PRODUCED":
      events.push(
        ...textMessage(
          `📦 Artifact produced: ${event.data.filename} by ${event.data.producedBy}`
        )
      );
      break;
  }

  // Always emit the custom event too for dashboard-specific handling
  events.push(customEvent(event));

  return events;
}

/** Encode an AG-UI event as an SSE data line */
export function encodeSSE(event: AgUiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Encode multiple events as SSE */
export function encodeSSEBatch(events: AgUiEvent[]): string {
  return events.map(encodeSSE).join("");
}
