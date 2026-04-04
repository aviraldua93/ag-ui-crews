import { useState } from "react";
import type { WaveState, TaskStatus } from "@shared/types";

interface WaveTimelineProps {
  waves: WaveState[];
}

const taskStatusStyle: Record<
  TaskStatus,
  { dot: string; text: string; badge: string; badgeLabel: string }
> = {
  pending: {
    dot: "bg-gray-600",
    text: "text-gray-500",
    badge: "bg-gray-800 text-gray-500 border-gray-700",
    badgeLabel: "pending",
  },
  submitted: {
    dot: "bg-gray-500",
    text: "text-gray-400",
    badge: "bg-gray-800 text-gray-400 border-gray-700",
    badgeLabel: "queued",
  },
  working: {
    dot: "bg-violet-500 animate-pulse",
    text: "text-violet-300",
    badge:
      "bg-violet-500/10 text-violet-400 border-violet-500/30",
    badgeLabel: "working",
  },
  completed: {
    dot: "bg-emerald-500",
    text: "text-gray-500",
    badge:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    badgeLabel: "done",
  },
  failed: {
    dot: "bg-rose-500",
    text: "text-rose-400",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    badgeLabel: "failed",
  },
  canceled: {
    dot: "bg-gray-700",
    text: "text-gray-600",
    badge: "bg-gray-800 text-gray-600 border-gray-700",
    badgeLabel: "canceled",
  },
};

export function WaveTimeline({ waves }: WaveTimelineProps) {
  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(
    new Set(),
  );

  if (waves.length === 0) {
    return (
      <div className="rounded-lg bg-gray-900/80 border border-gray-800 backdrop-blur-sm p-4">
        <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Timeline
        </h2>
        <div className="text-center py-8 text-gray-600 text-xs">
          No waves scheduled yet
        </div>
      </div>
    );
  }

  const toggleWave = (idx: number) => {
    setCollapsedWaves((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="rounded-lg bg-gray-900/80 border border-gray-800 backdrop-blur-sm p-4">
      <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Timeline
      </h2>
      <div className="relative">
        {/* Vertical connecting line */}
        {waves.length > 1 && (
          <div className="absolute left-3 top-4 bottom-4 w-px bg-gray-800" />
        )}

        <div className="space-y-2">
          {waves.map((wave, waveIdx) => {
            const completed = wave.tasks.filter(
              (t) => t.status === "completed",
            ).length;
            const total = wave.tasks.length;
            const isActive = wave.status === "active";
            const isDone = wave.status === "completed";
            const isFailed = wave.status === "failed";
            const isCollapsed = collapsedWaves.has(wave.index);
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div key={wave.index} className="relative pl-4">
                {/* Timeline dot */}
                <div
                  className={`absolute left-1 top-3 w-[9px] h-[9px] rounded-full border-2 z-10 ${
                    isActive
                      ? "bg-violet-500 border-violet-400"
                      : isDone
                        ? "bg-emerald-500 border-emerald-400"
                        : isFailed
                          ? "bg-rose-500 border-rose-400"
                          : "bg-gray-700 border-gray-600"
                  }`}
                />

                <div
                  className={`rounded-lg border transition-all ml-2 ${
                    isActive
                      ? "border-violet-500/30 bg-violet-500/5 shadow-[0_0_15px_-3px_rgba(139,92,246,0.15)]"
                      : isDone
                        ? "border-emerald-500/20 bg-gray-800/20"
                        : isFailed
                          ? "border-rose-500/20 bg-rose-500/5"
                          : "border-gray-800 bg-gray-800/30"
                  }`}
                >
                  {/* Wave header */}
                  <button
                    onClick={() => toggleWave(wave.index)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left"
                  >
                    <span className="text-xs font-semibold text-gray-300">
                      Wave {wave.index + 1}
                    </span>

                    {/* Status badge */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${
                        isActive
                          ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
                          : isDone
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : isFailed
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-gray-800 text-gray-500 border-gray-700"
                      }`}
                    >
                      {wave.status}
                    </span>

                    <span className="text-[10px] text-gray-600 font-mono">
                      {completed}/{total}
                    </span>

                    {/* Mini progress bar */}
                    <div className="flex-1 h-[3px] rounded-full bg-gray-800 overflow-hidden min-w-[40px]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isDone
                            ? "bg-emerald-500"
                            : isActive
                              ? "bg-violet-500"
                              : isFailed
                                ? "bg-rose-500"
                                : "bg-gray-700"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <span className="text-[10px] text-gray-700">
                      {isCollapsed ? "▼" : "▲"}
                    </span>
                  </button>

                  {/* Task cards */}
                  {!isCollapsed && (
                    <div className="px-3 pb-2.5 space-y-1">
                      {wave.tasks.map((task) => {
                        const style = taskStatusStyle[task.status];
                        return (
                          <div
                            key={task.id}
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                              task.status === "working"
                                ? "bg-violet-500/5"
                                : "bg-gray-800/30"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`}
                            />
                            <span
                              className={`text-xs truncate flex-1 ${style.text}`}
                            >
                              {task.title}
                            </span>
                            {task.assignedTo && (
                              <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">
                                {task.assignedTo}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border flex-shrink-0 ${style.badge}`}
                            >
                              {style.badgeLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Connecting segment below (except last) */}
                {waveIdx < waves.length - 1 && (
                  <div className="h-2" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}