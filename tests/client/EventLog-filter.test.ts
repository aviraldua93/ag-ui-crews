import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORIES,
  getEventCategory,
  filterEvents,
  excludeInternalEvents,
  summarize,
  type EventCategory,
} from "@client/components/EventLog";
import type { DashboardEvent, DashboardEventType } from "@shared/types";

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Create a DashboardEvent with sensible defaults. */
function makeEvent(
  type: DashboardEventType,
  data: Record<string, unknown> = {},
): DashboardEvent {
  return { type, timestamp: Date.now(), data };
}

// ─── Category Mapping ───────────────────────────────────────────────────────────

describe("EVENT_CATEGORIES — category mapping completeness", () => {
  const ALL_CATEGORIZED_TYPES: DashboardEventType[] = [
    "CREW_PLAN_STARTED",
    "CREW_PLAN_COMPLETED",
    "CREW_PLAN_FAILED",
    "WAVE_STARTED",
    "WAVE_COMPLETED",
    "WAVE_FAILED",
    "AGENT_REGISTERED",
    "AGENT_ACTIVE",
    "AGENT_COMPLETED",
    "AGENT_FAILED",
    "AGENT_RETRYING",
    "TASK_SUBMITTED",
    "TASK_WORKING",
    "TASK_COMPLETED",
    "TASK_FAILED",
    "TASK_RETRYING",
    "ARTIFACT_PRODUCED",
    "BRIDGE_CONNECTED",
    "BRIDGE_DISCONNECTED",
  ];

  it("maps every prefix-based DashboardEventType to a category", () => {
    for (const type of ALL_CATEGORIZED_TYPES) {
      const cat = getEventCategory(type);
      expect(cat, `Expected category for "${type}", got null`).not.toBeNull();
    }
  });

  it("returns null for uncategorized types (METRICS_UPDATE, STATE_SNAPSHOT)", () => {
    expect(getEventCategory("METRICS_UPDATE")).toBeNull();
    expect(getEventCategory("STATE_SNAPSHOT")).toBeNull();
  });

  it("maps CREW_PLAN_* types to PLAN", () => {
    expect(getEventCategory("CREW_PLAN_STARTED")).toBe("PLAN");
    expect(getEventCategory("CREW_PLAN_COMPLETED")).toBe("PLAN");
    expect(getEventCategory("CREW_PLAN_FAILED")).toBe("PLAN");
  });

  it("maps WAVE_* types to WAVE", () => {
    expect(getEventCategory("WAVE_STARTED")).toBe("WAVE");
    expect(getEventCategory("WAVE_COMPLETED")).toBe("WAVE");
    expect(getEventCategory("WAVE_FAILED")).toBe("WAVE");
  });

  it("maps AGENT_* types to AGENT", () => {
    expect(getEventCategory("AGENT_REGISTERED")).toBe("AGENT");
    expect(getEventCategory("AGENT_ACTIVE")).toBe("AGENT");
    expect(getEventCategory("AGENT_COMPLETED")).toBe("AGENT");
    expect(getEventCategory("AGENT_FAILED")).toBe("AGENT");
    expect(getEventCategory("AGENT_RETRYING")).toBe("AGENT");
  });

  it("maps TASK_* types to TASK", () => {
    expect(getEventCategory("TASK_SUBMITTED")).toBe("TASK");
    expect(getEventCategory("TASK_WORKING")).toBe("TASK");
    expect(getEventCategory("TASK_COMPLETED")).toBe("TASK");
    expect(getEventCategory("TASK_FAILED")).toBe("TASK");
    expect(getEventCategory("TASK_RETRYING")).toBe("TASK");
  });

  it("maps ARTIFACT_* types to ARTIFACT", () => {
    expect(getEventCategory("ARTIFACT_PRODUCED")).toBe("ARTIFACT");
  });

  it("maps BRIDGE_* types to BRIDGE", () => {
    expect(getEventCategory("BRIDGE_CONNECTED")).toBe("BRIDGE");
    expect(getEventCategory("BRIDGE_DISCONNECTED")).toBe("BRIDGE");
  });

  it("has exactly 6 categories: PLAN, WAVE, AGENT, TASK, ARTIFACT, BRIDGE", () => {
    const keys = Object.keys(EVENT_CATEGORIES);
    expect(keys).toHaveLength(6);
    expect(keys).toEqual(
      expect.arrayContaining(["PLAN", "WAVE", "AGENT", "TASK", "ARTIFACT", "BRIDGE"]),
    );
  });
});

// ─── filterEvents ───────────────────────────────────────────────────────────────

describe("filterEvents", () => {
  // A diverse set of events for filter testing
  const SAMPLE_EVENTS: DashboardEvent[] = [
    makeEvent("CREW_PLAN_STARTED"),
    makeEvent("CREW_PLAN_COMPLETED", { roleCount: 3, taskCount: 5 }),
    makeEvent("WAVE_STARTED", { waveIndex: 0, taskCount: 3 }),
    makeEvent("WAVE_COMPLETED", { waveIndex: 0 }),
    makeEvent("AGENT_REGISTERED", { name: "architect" }),
    makeEvent("AGENT_ACTIVE", { name: "backend-dev" }),
    makeEvent("TASK_SUBMITTED", { title: "Design API", taskId: "t1" }),
    makeEvent("TASK_WORKING", { title: "Implement login", taskId: "t2", assignedTo: "backend-dev" }),
    makeEvent("TASK_COMPLETED", { title: "Build UI", taskId: "t3", assignedTo: "frontend-dev" }),
    makeEvent("ARTIFACT_PRODUCED", { filename: "design.md", producedBy: "architect" }),
    makeEvent("BRIDGE_CONNECTED"),
    makeEvent("METRICS_UPDATE", { completedTasks: 3 }),
    makeEvent("STATE_SNAPSHOT"),
  ];

  it("returns all events when no filters are active", () => {
    const result = filterEvents(SAMPLE_EVENTS, new Set(), "");
    // When no filters are active, all events are returned unchanged
    expect(result).toHaveLength(SAMPLE_EVENTS.length);
    expect(result).toBe(SAMPLE_EVENTS); // same reference — short-circuit path
  });

  it("filters by a single category (TASK)", () => {
    const result = filterEvents(SAMPLE_EVENTS, new Set<EventCategory>(["TASK"]), "");
    expect(result).toHaveLength(3); // TASK_SUBMITTED, TASK_WORKING, TASK_COMPLETED
    expect(result.every((e) => e.type.startsWith("TASK_"))).toBe(true);
  });

  it("filters by a single category (WAVE)", () => {
    const result = filterEvents(SAMPLE_EVENTS, new Set<EventCategory>(["WAVE"]), "");
    expect(result).toHaveLength(2); // WAVE_STARTED, WAVE_COMPLETED
    expect(result.every((e) => e.type.startsWith("WAVE_"))).toBe(true);
  });

  it("filters by multiple categories (PLAN + AGENT)", () => {
    const result = filterEvents(
      SAMPLE_EVENTS,
      new Set<EventCategory>(["PLAN", "AGENT"]),
      "",
    );
    // PLAN: CREW_PLAN_STARTED, CREW_PLAN_COMPLETED (2)
    // AGENT: AGENT_REGISTERED, AGENT_ACTIVE (2)
    expect(result).toHaveLength(4);
    for (const e of result) {
      const cat = getEventCategory(e.type);
      expect(["PLAN", "AGENT"]).toContain(cat);
    }
  });

  it("filters by text search (case-insensitive)", () => {
    const result = filterEvents(SAMPLE_EVENTS, new Set(), "architect");
    // Matches: AGENT_REGISTERED ("Agent registered: architect"), ARTIFACT_PRODUCED ("Artifact: design.md by architect")
    expect(result).toHaveLength(2);
    expect(result.some((e) => e.type === "AGENT_REGISTERED")).toBe(true);
    expect(result.some((e) => e.type === "ARTIFACT_PRODUCED")).toBe(true);
  });

  it("text search is case-insensitive", () => {
    const resultLower = filterEvents(SAMPLE_EVENTS, new Set(), "architect");
    const resultUpper = filterEvents(SAMPLE_EVENTS, new Set(), "ARCHITECT");
    const resultMixed = filterEvents(SAMPLE_EVENTS, new Set(), "Architect");

    expect(resultLower).toHaveLength(resultUpper.length);
    expect(resultLower).toHaveLength(resultMixed.length);
    expect(resultLower.map((e) => e.type)).toEqual(resultUpper.map((e) => e.type));
  });

  it("combines category + text search with AND logic", () => {
    // Category AGENT + text "architect"
    // Only AGENT_REGISTERED for "architect" should match (not ARTIFACT_PRODUCED)
    const result = filterEvents(
      SAMPLE_EVENTS,
      new Set<EventCategory>(["AGENT"]),
      "architect",
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("AGENT_REGISTERED");
  });

  it("returns empty array when no events match filters", () => {
    const result = filterEvents(
      SAMPLE_EVENTS,
      new Set<EventCategory>(["BRIDGE"]),
      "nonexistent-query-xyz",
    );
    expect(result).toHaveLength(0);
  });

  it("returns empty array when category has no matching events in input", () => {
    const onlyTasks: DashboardEvent[] = [
      makeEvent("TASK_SUBMITTED", { title: "Do stuff", taskId: "t1" }),
    ];
    const result = filterEvents(onlyTasks, new Set<EventCategory>(["WAVE"]), "");
    expect(result).toHaveLength(0);
  });
});

// ─── excludeInternalEvents ──────────────────────────────────────────────────────

describe("excludeInternalEvents", () => {
  it("removes METRICS_UPDATE and STATE_SNAPSHOT", () => {
    const events: DashboardEvent[] = [
      makeEvent("TASK_COMPLETED", { assignedTo: "dev", title: "x" }),
      makeEvent("METRICS_UPDATE"),
      makeEvent("STATE_SNAPSHOT"),
      makeEvent("WAVE_STARTED", { waveIndex: 0, taskCount: 1 }),
    ];
    const result = excludeInternalEvents(events);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.type)).toEqual(["TASK_COMPLETED", "WAVE_STARTED"]);
  });
});

// ─── summarize ──────────────────────────────────────────────────────────────────

describe("summarize", () => {
  it("produces human-readable text for known event types", () => {
    const event = makeEvent("TASK_COMPLETED", {
      assignedTo: "backend-dev",
      title: "Build API",
      taskId: "t1",
    });
    const text = summarize(event);
    expect(text).toContain("backend-dev");
    expect(text).toContain("Build API");
  });

  it("falls back to event type string for unknown types", () => {
    // Cast to bypass type checking for this edge case test
    const event = makeEvent("UNKNOWN_TYPE" as DashboardEventType);
    const text = summarize(event);
    expect(text).toBe("UNKNOWN_TYPE");
  });
});
