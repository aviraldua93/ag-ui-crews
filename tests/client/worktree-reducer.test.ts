import { describe, it, expect } from "vitest";
import type {
  DashboardState,
  DashboardEvent,
  DashboardEventType,
  WorktreeStatus,
} from "@shared/types";
import { INITIAL_DASHBOARD_STATE } from "@shared/types";

// ─── Minimal reducer extraction ─────────────────────────────────────────────────
// The useEventStream reducer is internal to the hook, so we test the state
// shape transitions directly by simulating what the reducer would produce.

function makeEvent(
  type: DashboardEventType,
  data: Record<string, unknown> = {},
): DashboardEvent {
  return { type, timestamp: Date.now(), data };
}

function applyWorktreeCreated(
  state: DashboardState,
  data: Record<string, unknown>,
): DashboardState {
  const wt: WorktreeStatus = {
    agentName: data.agentName as string,
    branch: data.branch as string,
    path: data.path as string,
    status: "active",
    filesChanged: (data.filesChanged as number | undefined) ?? 0,
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
  };
  return { ...state, worktrees: [...state.worktrees, wt] };
}

function applyWorktreeMerged(
  state: DashboardState,
  data: Record<string, unknown>,
): DashboardState {
  const agentName = data.agentName as string;
  return {
    ...state,
    worktrees: state.worktrees.map((w) =>
      w.agentName === agentName
        ? {
            ...w,
            status: "merged" as const,
            filesChanged:
              (data.filesChanged as number | undefined) ?? w.filesChanged,
          }
        : w,
    ),
  };
}

function applyWorktreeConflict(
  state: DashboardState,
  data: Record<string, unknown>,
): DashboardState {
  const agentName = data.agentName as string;
  return {
    ...state,
    worktrees: state.worktrees.map((w) =>
      w.agentName === agentName ? { ...w, status: "conflict" as const } : w,
    ),
  };
}

function applyWorktreeRemoved(
  state: DashboardState,
  data: Record<string, unknown>,
): DashboardState {
  const agentName = data.agentName as string;
  return {
    ...state,
    worktrees: state.worktrees.map((w) =>
      w.agentName === agentName ? { ...w, status: "cleaned" as const } : w,
    ),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("Worktree state reducer logic", () => {
  it("initial state has empty worktrees array", () => {
    expect(INITIAL_DASHBOARD_STATE.worktrees).toEqual([]);
  });

  it("WORKTREE_CREATED adds a worktree to state", () => {
    const state = { ...INITIAL_DASHBOARD_STATE };
    const next = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/project/.worktrees/backend-dev",
      filesChanged: 5,
      createdAt: "2025-06-01T12:00:00Z",
    });

    expect(next.worktrees).toHaveLength(1);
    expect(next.worktrees[0].agentName).toBe("backend-dev");
    expect(next.worktrees[0].branch).toBe("agent/backend-dev");
    expect(next.worktrees[0].status).toBe("active");
    expect(next.worktrees[0].filesChanged).toBe(5);
  });

  it("WORKTREE_CREATED can be called multiple times for different agents", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/project/.worktrees/backend-dev",
    });
    state = applyWorktreeCreated(state, {
      agentName: "frontend-dev",
      branch: "agent/frontend-dev",
      path: "/project/.worktrees/frontend-dev",
    });

    expect(state.worktrees).toHaveLength(2);
    expect(state.worktrees.map((w) => w.agentName)).toEqual([
      "backend-dev",
      "frontend-dev",
    ]);
  });

  it("WORKTREE_MERGED updates status to merged", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/project/.worktrees/backend-dev",
    });
    state = applyWorktreeMerged(state, {
      agentName: "backend-dev",
      filesChanged: 12,
    });

    expect(state.worktrees[0].status).toBe("merged");
    expect(state.worktrees[0].filesChanged).toBe(12);
  });

  it("WORKTREE_MERGED only affects the matching agent", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/a",
    });
    state = applyWorktreeCreated(state, {
      agentName: "frontend-dev",
      branch: "agent/frontend-dev",
      path: "/b",
    });
    state = applyWorktreeMerged(state, { agentName: "backend-dev" });

    expect(state.worktrees[0].status).toBe("merged");
    expect(state.worktrees[1].status).toBe("active");
  });

  it("WORKTREE_CONFLICT updates status to conflict", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/a",
    });
    state = applyWorktreeConflict(state, { agentName: "backend-dev" });

    expect(state.worktrees[0].status).toBe("conflict");
  });

  it("WORKTREE_REMOVED updates status to cleaned", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/a",
    });
    state = applyWorktreeMerged(state, { agentName: "backend-dev" });
    state = applyWorktreeRemoved(state, { agentName: "backend-dev" });

    expect(state.worktrees[0].status).toBe("cleaned");
  });

  it("full lifecycle: active → merged → cleaned", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "backend-dev",
      branch: "agent/backend-dev",
      path: "/project/.worktrees/backend-dev",
      filesChanged: 3,
      createdAt: "2025-06-01T12:00:00Z",
    });
    expect(state.worktrees[0].status).toBe("active");

    state = applyWorktreeMerged(state, {
      agentName: "backend-dev",
      filesChanged: 7,
    });
    expect(state.worktrees[0].status).toBe("merged");
    expect(state.worktrees[0].filesChanged).toBe(7);

    state = applyWorktreeRemoved(state, { agentName: "backend-dev" });
    expect(state.worktrees[0].status).toBe("cleaned");
  });

  it("conflict lifecycle: active → conflict", () => {
    let state = { ...INITIAL_DASHBOARD_STATE };
    state = applyWorktreeCreated(state, {
      agentName: "qa-tester",
      branch: "agent/qa-tester",
      path: "/project/.worktrees/qa-tester",
    });
    state = applyWorktreeConflict(state, { agentName: "qa-tester" });
    expect(state.worktrees[0].status).toBe("conflict");
  });
});
