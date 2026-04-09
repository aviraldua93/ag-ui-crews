import { GitBranch, FileText } from "lucide-react";
import type { WorktreeStatus, WorktreeStatusValue } from "@shared/types";

interface WorktreePanelProps {
  worktrees: WorktreeStatus[];
}

const STATUS_INDICATOR: Record<WorktreeStatusValue, { dot: string; label: string }> = {
  active:   { dot: "bg-emerald-500",  label: "active" },
  merging:  { dot: "bg-blue-500",     label: "merging" },
  merged:   { dot: "bg-emerald-400",  label: "merged" },
  conflict: { dot: "bg-rose-500",     label: "conflict" },
  cleaned:  { dot: "bg-gray-500",     label: "cleaned" },
};

const STATUS_BADGE: Record<WorktreeStatusValue, string> = {
  active:   "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  merging:  "bg-blue-500/10 text-blue-400 border border-blue-500/30",
  merged:   "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  conflict: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
  cleaned:  "bg-gray-800 text-gray-500 border border-gray-700",
};

const BORDER_LEFT: Record<WorktreeStatusValue, string> = {
  active:   "border-l-emerald-500",
  merging:  "border-l-blue-500",
  merged:   "border-l-emerald-400",
  conflict: "border-l-rose-500",
  cleaned:  "border-l-gray-700",
};

const statusOrder: Record<WorktreeStatusValue, number> = {
  active:   0,
  merging:  1,
  conflict: 2,
  merged:   3,
  cleaned:  4,
};

export function WorktreePanel({ worktrees }: WorktreePanelProps) {
  if (worktrees.length === 0) return null;

  const sorted = [...worktrees].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  );

  const activeCount = worktrees.filter(
    (w) => w.status !== "cleaned" && w.status !== "merged",
  ).length;

  return (
    <div
      data-testid="worktree-panel"
      className="rounded-lg bg-gray-900/80 border border-gray-800 backdrop-blur-sm p-3"
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <GitBranch className="w-3 h-3" />
          Worktrees
        </h2>
        {activeCount > 0 && (
          <span className="text-[9px] font-mono text-gray-600">
            {activeCount} active
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {sorted.map((wt) => {
          const indicator = STATUS_INDICATOR[wt.status];
          const isTerminal = wt.status === "cleaned" || wt.status === "merged";

          return (
            <div
              key={`${wt.agentName}-${wt.branch}`}
              data-testid="worktree-row"
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border-l-2 transition-colors ${BORDER_LEFT[wt.status]} ${isTerminal ? "bg-gray-800/20 opacity-60" : "bg-gray-800/40"}`}
            >
              {/* Status dot */}
              <span
                data-testid="worktree-status-dot"
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${indicator.dot} ${wt.status === "active" ? "animate-pulse" : ""}`}
              />

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs font-semibold truncate ${isTerminal ? "text-gray-500" : "text-gray-200"}`}
                >
                  {wt.agentName}
                </div>
                <div className="text-[10px] text-gray-600 truncate font-mono">
                  {wt.branch}
                </div>
              </div>

              {/* Files changed + status badge */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {wt.filesChanged != null && wt.filesChanged > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] font-mono text-gray-500">
                    <FileText className="w-2.5 h-2.5" />
                    {wt.filesChanged}
                  </span>
                )}
                <span
                  data-testid="worktree-status-badge"
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${STATUS_BADGE[wt.status]}`}
                >
                  {indicator.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
