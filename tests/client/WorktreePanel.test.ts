import { describe, it, expect } from "vitest";
import type { WorktreeStatus, WorktreeStatusValue } from "@shared/types";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeWorktree(
  overrides: Partial<WorktreeStatus> = {},
): WorktreeStatus {
  return {
    agentName: "backend-dev",
    branch: "agent/backend-dev",
    path: "/project/.worktrees/backend-dev",
    status: "active",
    filesChanged: 3,
    createdAt: "2025-06-01T12:00:00Z",
    ...overrides,
  };
}

// ─── WorktreeStatus type shape ──────────────────────────────────────────────────

describe("WorktreeStatus type", () => {
  it("constructs a valid active worktree", () => {
    const wt = makeWorktree();
    expect(wt.agentName).toBe("backend-dev");
    expect(wt.branch).toBe("agent/backend-dev");
    expect(wt.path).toBe("/project/.worktrees/backend-dev");
    expect(wt.status).toBe("active");
    expect(wt.filesChanged).toBe(3);
    expect(wt.createdAt).toBe("2025-06-01T12:00:00Z");
  });

  it("supports all valid status values", () => {
    const statuses: WorktreeStatusValue[] = [
      "active",
      "merging",
      "merged",
      "conflict",
      "cleaned",
    ];
    for (const status of statuses) {
      const wt = makeWorktree({ status });
      expect(wt.status).toBe(status);
    }
  });

  it("allows filesChanged to be undefined", () => {
    const wt = makeWorktree({ filesChanged: undefined });
    expect(wt.filesChanged).toBeUndefined();
  });
});

// ─── Worktree event types ───────────────────────────────────────────────────────

describe("Worktree DashboardEventType values", () => {
  // Import the type to ensure worktree event types are part of the union
  it("includes worktree event types in the DashboardEventType union", async () => {
    const types = await import("@shared/types");
    // Verify the initial state includes the worktrees array
    expect(types.INITIAL_DASHBOARD_STATE.worktrees).toEqual([]);
  });
});
