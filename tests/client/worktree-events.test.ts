import { describe, it, expect } from "vitest";
import { translateToAgUi, AG_UI_EVENT_TYPES } from "@shared/events";
import type { DashboardEvent, DashboardEventType } from "@shared/types";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeEvent(
  type: DashboardEventType,
  data: Record<string, unknown> = {},
): DashboardEvent {
  return { type, timestamp: Date.now(), data };
}

// ─── Worktree Event Translation ─────────────────────────────────────────────────

describe("translateToAgUi — worktree events", () => {
  it("translates WORKTREE_CREATED to text message + custom event", () => {
    const event = makeEvent("WORKTREE_CREATED", {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/project/.worktrees/backend-dev",
    });
    const agUiEvents = translateToAgUi(event);

    // Should have: TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, CUSTOM
    expect(agUiEvents.length).toBeGreaterThanOrEqual(4);

    const textContent = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.TEXT_MESSAGE_CONTENT,
    );
    expect(textContent).toBeDefined();
    expect(textContent!.delta as string).toContain("backend-dev");
    expect(textContent!.delta as string).toContain("agent/backend-dev");

    const custom = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.CUSTOM,
    );
    expect(custom).toBeDefined();
    expect(custom!.name).toBe("WORKTREE_CREATED");
  });

  it("translates WORKTREE_MERGED to text message + custom event", () => {
    const event = makeEvent("WORKTREE_MERGED", {
      agentName: "frontend-dev",
      branch: "agent/frontend-dev",
    });
    const agUiEvents = translateToAgUi(event);

    const textContent = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.TEXT_MESSAGE_CONTENT,
    );
    expect(textContent).toBeDefined();
    expect(textContent!.delta as string).toContain("frontend-dev");
    expect(textContent!.delta as string).toContain("merged");

    const custom = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.CUSTOM,
    );
    expect(custom!.name).toBe("WORKTREE_MERGED");
  });

  it("translates WORKTREE_CONFLICT to text message + custom event", () => {
    const event = makeEvent("WORKTREE_CONFLICT", {
      agentName: "qa-tester",
      branch: "agent/qa-tester",
    });
    const agUiEvents = translateToAgUi(event);

    const textContent = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.TEXT_MESSAGE_CONTENT,
    );
    expect(textContent).toBeDefined();
    expect(textContent!.delta as string).toContain("conflict");
    expect(textContent!.delta as string).toContain("qa-tester");

    const custom = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.CUSTOM,
    );
    expect(custom!.name).toBe("WORKTREE_CONFLICT");
  });

  it("translates WORKTREE_REMOVED to text message + custom event", () => {
    const event = makeEvent("WORKTREE_REMOVED", {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
    });
    const agUiEvents = translateToAgUi(event);

    const textContent = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.TEXT_MESSAGE_CONTENT,
    );
    expect(textContent).toBeDefined();
    expect(textContent!.delta as string).toContain("removed");

    const custom = agUiEvents.find(
      (e) => e.type === AG_UI_EVENT_TYPES.CUSTOM,
    );
    expect(custom!.name).toBe("WORKTREE_REMOVED");
  });

  it("always includes a CUSTOM event wrapper for worktree events", () => {
    const worktreeTypes: DashboardEventType[] = [
      "WORKTREE_CREATED",
      "WORKTREE_MERGED",
      "WORKTREE_CONFLICT",
      "WORKTREE_REMOVED",
    ];

    for (const type of worktreeTypes) {
      const event = makeEvent(type, {
        agentName: "test-agent",
        branch: "agent/test",
      });
      const agUiEvents = translateToAgUi(event);
      const customEvents = agUiEvents.filter(
        (e) => e.type === AG_UI_EVENT_TYPES.CUSTOM,
      );
      expect(customEvents).toHaveLength(1);
      expect(customEvents[0].name).toBe(type);
    }
  });
});
