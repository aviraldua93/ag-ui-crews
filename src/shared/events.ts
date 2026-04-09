/**
 * AG-UI event helpers for ag-ui-crews.
 *
 * This module is the translation layer between the internal
 * {@link DashboardEvent} bus and the AG-UI protocol sent to clients over SSE.
 *
 * It provides:
 * 1. **`AG_UI_EVENT_TYPES`** — a const object mirroring the `@ag-ui/core`
 *    `EventType` enum values used for SSE serialization.
 * 2. **Event factory functions** — `runStarted`, `runFinished`, `runError`,
 *    `stepStarted`, `stepFinished`, `textMessage`, `stateSnapshot`,
 *    `stateDelta`, and `customEvent` — each producing a well-formed
 *    {@link AgUiEvent} object.
 * 3. **`translateToAgUi`** — the main switch that maps a
 *    {@link DashboardEvent} to one or more AG-UI events, appending a
 *    `CUSTOM` wrapper for every event so that dashboard-specific data is
 *    always available on the client.
 * 4. **`encodeSSE` / `encodeSSEBatch`** — wire-format helpers that
 *    serialize AG-UI events into the `data: JSON\n\n` format required by
 *    the Server-Sent Events specification.
 *
 * The server's `EventEmitter` calls `translateToAgUi` -> `encodeSSEBatch`
 * on every dashboard event and writes the result to all connected SSE
 * clients.  The client's `useEventStream` hook parses the SSE stream and
 * dispatches based on the `type` field.
 *
 * @module shared/events
 */
import type {
  DashboardEvent,
  DashboardEventType,
  DashboardState,
} from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * AG-UI protocol event type constants.
 *
 * Mirrors the `EventType` enum from `@ag-ui/core` so that the project does
 * not need a runtime import of the `@ag-ui/core` package.  These string
 * values are embedded in every {@link AgUiEvent} and appear on the SSE wire
 * as the `type` field.  The client's `useEventStream` hook switches on
 * these constants to decide how to process each incoming event.
 *
 * **Lifecycle events:**
 * - `RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR` — session lifecycle.
 * - `STEP_STARTED` / `STEP_FINISHED` — planning and wave steps.
 *
 * **Text streaming events:**
 * - `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` —
 *   a three-part triad that delivers streaming text messages.
 *
 * **State synchronization events:**
 * - `STATE_SNAPSHOT` — full {@link DashboardState} for late-joining clients.
 * - `STATE_DELTA` — JSON Patch operations for incremental updates.
 *
 * **Tool call events (reserved):**
 * - `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` — not actively
 *   used yet, but included for protocol completeness.
 *
 * **Extension event:**
 * - `CUSTOM` — wraps any {@link DashboardEvent} for dashboard-specific handling.
 *
 * @see {@link AgUiEvent}      — the event envelope that uses these types.
 * @see {@link translateToAgUi} — the function that produces events of these types.
 */
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

/**
 * Union of all AG-UI event type string literals.
 *
 * Derived from the values in {@link AG_UI_EVENT_TYPES}.  Equivalent to:
 * ```ts
 * "RUN_STARTED" | "RUN_FINISHED" | "RUN_ERROR" | "STEP_STARTED" | ...
 * ```
 */
export type AgUiEventType =
  (typeof AG_UI_EVENT_TYPES)[keyof typeof AG_UI_EVENT_TYPES];

/**
 * An AG-UI protocol event ready for SSE serialization.
 *
 * Every event carries a `type` discriminant and a `timestamp`, plus
 * additional fields that vary by type (e.g., `threadId`, `runId`,
 * `snapshot`, `delta`, `messageId`, etc.).  The index signature allows
 * type-specific properties without needing per-type interfaces.
 *
 * @see {@link AG_UI_EVENT_TYPES} — the valid `type` values.
 * @see {@link encodeSSE}         — serializes this to SSE wire format.
 */
export interface AgUiEvent {
  /** AG-UI event type discriminant. */
  type: AgUiEventType;
  /** Unix timestamp (ms) when the event was created. */
  timestamp: number;
  /** Additional type-specific fields (e.g. `threadId`, `snapshot`, `delta`). */
  [key: string]: unknown;
}

/**
 * Creates a `RUN_STARTED` AG-UI event signalling the beginning of a session.
 *
 * Called by the server's `/api/simulate` and `/api/connect` endpoints when a
 * new session is initiated.  The client uses this event to transition the
 * dashboard phase and store the thread/run identifiers.
 *
 * @param threadId - Unique identifier for the SSE thread (conversation).
 * @param runId    - Unique identifier for this execution run within the thread.
 * @returns A single {@link AgUiEvent} with `type: "RUN_STARTED"`.
 *
 * @example
 * ```ts
 * const event = runStarted("thread-abc", "run-123");
 * // => { type: "RUN_STARTED", threadId: "thread-abc", runId: "run-123", timestamp: 1717243200000 }
 * ```
 */
export function runStarted(threadId: string, runId: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  };
}

/**
 * Creates a `RUN_FINISHED` AG-UI event signalling the end of a session.
 *
 * Called by the server when a simulation completes or a live session is
 * stopped.  The client uses this to transition the dashboard to the
 * `"completed"` phase.
 *
 * @param threadId - The thread identifier matching the earlier {@link runStarted} call.
 * @param runId    - The run identifier matching the earlier {@link runStarted} call.
 * @returns A single {@link AgUiEvent} with `type: "RUN_FINISHED"`.
 *
 * @example
 * ```ts
 * const event = runFinished("thread-abc", "run-123");
 * // => { type: "RUN_FINISHED", threadId: "thread-abc", runId: "run-123", timestamp: 1717243250000 }
 * ```
 */
export function runFinished(threadId: string, runId: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.RUN_FINISHED,
    threadId,
    runId,
    timestamp: Date.now(),
  };
}

/**
 * Creates a `RUN_ERROR` AG-UI event signalling an unrecoverable session error.
 *
 * Used when the server encounters a fatal error (e.g. bridge connection lost,
 * simulation crash).  The client transitions the dashboard to the `"error"`
 * phase and displays the error message.
 *
 * @param message - Human-readable error description.
 * @param code    - Optional machine-readable error code for programmatic handling.
 * @returns A single {@link AgUiEvent} with `type: "RUN_ERROR"`.
 *
 * @example
 * ```ts
 * const event = runError("Bridge connection lost", "BRIDGE_TIMEOUT");
 * // => { type: "RUN_ERROR", message: "Bridge connection lost", code: "BRIDGE_TIMEOUT", timestamp: ... }
 * ```
 */
export function runError(message: string, code?: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.RUN_ERROR,
    message,
    code,
    timestamp: Date.now(),
  };
}

/**
 * Creates a `STEP_STARTED` AG-UI event marking the beginning of a logical step.
 *
 * Steps correspond to high-level phases of execution — `"planning"` for the
 * planning phase and `"wave-N"` for each execution wave.  The client can
 * use these to show progress indicators.
 *
 * @param stepName - Name of the step (e.g. `"planning"`, `"wave-0"`, `"wave-1"`).
 * @returns A single {@link AgUiEvent} with `type: "STEP_STARTED"`.
 *
 * @example
 * ```ts
 * const event = stepStarted("wave-0");
 * // => { type: "STEP_STARTED", stepName: "wave-0", timestamp: ... }
 * ```
 */
export function stepStarted(stepName: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STEP_STARTED,
    stepName,
    timestamp: Date.now(),
  };
}

/**
 * Creates a `STEP_FINISHED` AG-UI event marking the completion of a logical step.
 *
 * Paired with a prior {@link stepStarted} call using the same `stepName`.
 *
 * @param stepName - Name of the step that finished (must match a prior `stepStarted`).
 * @returns A single {@link AgUiEvent} with `type: "STEP_FINISHED"`.
 *
 * @example
 * ```ts
 * const event = stepFinished("planning");
 * // => { type: "STEP_FINISHED", stepName: "planning", timestamp: ... }
 * ```
 */
export function stepFinished(stepName: string): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STEP_FINISHED,
    stepName,
    timestamp: Date.now(),
  };
}

/**
 * Creates a streaming text message triad (START -> CONTENT -> END).
 *
 * The AG-UI protocol models text messages as three events sharing a
 * `messageId`.  This function generates all three at once for convenience,
 * delivering the entire `content` in a single `TEXT_MESSAGE_CONTENT` delta.
 *
 * Used by {@link translateToAgUi} to produce human-readable status messages
 * for events like task completion, wave start, and agent registration.
 *
 * @param content - The full text content to deliver (e.g. `"Plan ready - 3 roles, 5 tasks"`).
 * @param role    - The message role, defaults to `"assistant"`.
 * @returns An array of three {@link AgUiEvent}s: `TEXT_MESSAGE_START`,
 *   `TEXT_MESSAGE_CONTENT`, and `TEXT_MESSAGE_END`, all sharing the same
 *   auto-generated `messageId`.
 *
 * @example
 * ```ts
 * const events = textMessage("Wave 1 started - 3 tasks in parallel");
 * // => [
 * //   { type: "TEXT_MESSAGE_START",   messageId: "uuid...", role: "assistant", timestamp: ... },
 * //   { type: "TEXT_MESSAGE_CONTENT", messageId: "uuid...", delta: "Wave 1 started ...", timestamp: ... },
 * //   { type: "TEXT_MESSAGE_END",     messageId: "uuid...", timestamp: ... },
 * // ]
 * ```
 */
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

/**
 * Creates a `STATE_SNAPSHOT` AG-UI event carrying the full dashboard state.
 *
 * Sent to newly-connected SSE clients so they can hydrate the dashboard
 * without replaying the entire event history.  The `EventEmitter` calls
 * this on every new client connection.
 *
 * @param state - The current {@link DashboardState} to snapshot.
 * @returns A single {@link AgUiEvent} with `type: "STATE_SNAPSHOT"` and the
 *   full state in the `snapshot` field.
 *
 * @example
 * ```ts
 * const event = stateSnapshot(dashboardState);
 * // => { type: "STATE_SNAPSHOT", snapshot: { phase: "executing", ... }, timestamp: ... }
 * ```
 */
export function stateSnapshot(state: DashboardState): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STATE_SNAPSHOT,
    snapshot: state,
    timestamp: Date.now(),
  };
}

/**
 * Creates a `STATE_DELTA` AG-UI event carrying JSON Patch operations.
 *
 * Allows incremental state updates instead of full snapshots, reducing SSE
 * payload size for high-frequency events like metrics updates.
 *
 * @param operations - Array of JSON Patch operations conforming to RFC 6902.
 *   Each operation has an `op` (`"add"`, `"replace"`, `"remove"`, etc.),
 *   a JSON Pointer `path`, and an optional `value`.
 * @returns A single {@link AgUiEvent} with `type: "STATE_DELTA"` and the
 *   operations in the `delta` field.
 *
 * @example
 * ```ts
 * const event = stateDelta([
 *   { op: "replace", path: "/metrics/completedTasks", value: 5 },
 *   { op: "replace", path: "/metrics/totalTime", value: 32100 },
 * ]);
 * // => { type: "STATE_DELTA", delta: [...], timestamp: ... }
 * ```
 */
export function stateDelta(
  operations: Array<{ op: string; path: string; value?: unknown }>
): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.STATE_DELTA,
    delta: operations,
    timestamp: Date.now(),
  };
}

/**
 * Creates a `CUSTOM` AG-UI event that wraps a dashboard-specific event.
 *
 * Every {@link DashboardEvent} is always emitted as a `CUSTOM` event
 * (in addition to any protocol-level events) so that the client can
 * access the full dashboard event data, including its original
 * {@link DashboardEventType} and payload.
 *
 * The `name` field is set to the dashboard event type, and the `value`
 * field carries the event's `data` payload.  The timestamp is preserved
 * from the source event rather than using `Date.now()`.
 *
 * @param dashboardEvent - The {@link DashboardEvent} to wrap.
 * @returns A single {@link AgUiEvent} with `type: "CUSTOM"`, `name` set to
 *   the dashboard event type, and `value` set to the event data.
 *
 * @example
 * ```ts
 * const event = customEvent({
 *   type: "TASK_COMPLETED",
 *   timestamp: 1717243320000,
 *   data: { taskId: "implement-api", assignedTo: "backend-dev" },
 * });
 * // => { type: "CUSTOM", name: "TASK_COMPLETED", value: { taskId: ..., ... }, timestamp: 1717243320000 }
 * ```
 */
export function customEvent(dashboardEvent: DashboardEvent): AgUiEvent {
  return {
    type: AG_UI_EVENT_TYPES.CUSTOM,
    name: dashboardEvent.type,
    value: dashboardEvent.data,
    timestamp: dashboardEvent.timestamp,
  };
}

/**
 * Translates a {@link DashboardEvent} into one or more {@link AgUiEvent}s.
 *
 * This is the central translation function in the SSE pipeline.  The server's
 * `EventEmitter.broadcastDashboardEvent()` calls it for every internal event,
 * serializes the resulting AG-UI events with {@link encodeSSEBatch}, and
 * writes them to all connected clients.
 *
 * **Translation rules by {@link DashboardEventType}:**
 *
 * | Dashboard Event        | AG-UI Events Produced                                    |
 * |------------------------|----------------------------------------------------------|
 * | `CREW_PLAN_STARTED`    | `STEP_STARTED("planning")` + text message                |
 * | `CREW_PLAN_COMPLETED`  | `STEP_FINISHED("planning")` + text message with counts   |
 * | `WAVE_STARTED`         | `STEP_STARTED("wave-N")` + text message                  |
 * | `WAVE_COMPLETED`       | `STEP_FINISHED("wave-N")`                                |
 * | `AGENT_REGISTERED`     | Text message with agent name                             |
 * | `TASK_WORKING`         | Text message with agent + task title                     |
 * | `TASK_COMPLETED`       | Text message with agent + task title                     |
 * | `TASK_FAILED`          | Text message with agent + task title                     |
 * | `ARTIFACT_PRODUCED`    | Text message with filename + producer                    |
 * | *(all other types)*    | *(no protocol-level events)*                             |
 *
 * **Every** event — whether it matched a case above or not — also has a
 * `CUSTOM` event appended via {@link customEvent}.  This ensures the client
 * always receives the raw dashboard event data for its own reducer.
 *
 * @param event - The {@link DashboardEvent} to translate.
 * @returns An array of one or more {@link AgUiEvent}s.  The array always
 *   contains at least one element (the `CUSTOM` wrapper).
 *
 * @example
 * ```ts
 * const agUiEvents = translateToAgUi({
 *   type: "WAVE_STARTED",
 *   timestamp: Date.now(),
 *   data: { waveIndex: 0, taskCount: 3 },
 * });
 * // => [
 * //   { type: "STEP_STARTED", stepName: "wave-0", ... },
 * //   { type: "TEXT_MESSAGE_START", ... },
 * //   { type: "TEXT_MESSAGE_CONTENT", delta: "Wave 1 started - 3 tasks ...", ... },
 * //   { type: "TEXT_MESSAGE_END", ... },
 * //   { type: "CUSTOM", name: "WAVE_STARTED", value: { waveIndex: 0, taskCount: 3 }, ... },
 * // ]
 * ```
 */
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

    case "WORKTREE_CREATED":
      events.push(
        ...textMessage(
          `🌿 Worktree created: ${event.data.branch} for ${event.data.agentName}`
        )
      );
      break;

    case "WORKTREE_MERGED":
      events.push(
        ...textMessage(
          `✅ Worktree merged: ${event.data.branch} by ${event.data.agentName}`
        )
      );
      break;

    case "WORKTREE_CONFLICT":
      events.push(
        ...textMessage(
          `🔴 Merge conflict: ${event.data.branch} for ${event.data.agentName}`
        )
      );
      break;

    case "WORKTREE_REMOVED":
      events.push(
        ...textMessage(
          `🧹 Worktree removed: ${event.data.branch} for ${event.data.agentName}`
        )
      );
      break;
  }

  // Always emit the custom event too for dashboard-specific handling
  events.push(customEvent(event));

  return events;
}

/**
 * Encodes a single {@link AgUiEvent} as an SSE `data:` line.
 *
 * The Server-Sent Events specification requires each event to be formatted
 * as `data: <payload>\n\n` where the double newline signals the end of the
 * event.  This function JSON-serializes the event and wraps it in that
 * format.
 *
 * Used internally by {@link encodeSSEBatch} and directly by the
 * `EventEmitter` when sending the initial state snapshot to a newly
 * connected client.
 *
 * @param event - The AG-UI event to encode.
 * @returns A string in SSE wire format: `"data: {\"type\":...}\n\n"`.
 *
 * @example
 * ```ts
 * const sse = encodeSSE({ type: "RUN_STARTED", threadId: "t1", runId: "r1", timestamp: 123 });
 * // => 'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1","timestamp":123}\n\n'
 * ```
 */
export function encodeSSE(event: AgUiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Encodes an array of {@link AgUiEvent}s as a concatenated SSE string.
 *
 * Each event is individually encoded via {@link encodeSSE} and the results
 * are joined into a single string suitable for writing to an SSE response
 * stream.  This is the final step in the server's broadcast pipeline:
 *
 * ```
 * DashboardEvent -> translateToAgUi() -> AgUiEvent[] -> encodeSSEBatch() -> string -> Response.write()
 * ```
 *
 * @param events - Array of AG-UI events to encode.
 * @returns A concatenated SSE string with one `data:` block per event.
 *
 * @example
 * ```ts
 * const sse = encodeSSEBatch([
 *   { type: "STEP_STARTED", stepName: "wave-0", timestamp: 123 },
 *   { type: "CUSTOM", name: "WAVE_STARTED", value: { waveIndex: 0 }, timestamp: 123 },
 * ]);
 * // => 'data: {"type":"STEP_STARTED",...}\n\ndata: {"type":"CUSTOM",...}\n\n'
 * ```
 */
export function encodeSSEBatch(events: AgUiEvent[]): string {
  return events.map(encodeSSE).join("");
}