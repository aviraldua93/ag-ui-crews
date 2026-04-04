import { useState } from "react";
import type { WaveState, TaskStatus } from "@shared/types";

interface WaveTimelineProps {
  waves: WaveState[];
}

const taskDot: Record<TaskStatus, string> = {
  pending: "bg-gray-600",
  submitted: "bg-gray-500",
  working: "bg-violet-500 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  canceled: "bg-gray-700",
};

export function WaveTimeline({ waves }: WaveTimelineProps) {
  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(new Set());

  if (waves.length === 0) {
    return (
      <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
        <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Timeline</h2>
        <div className="text-center py-6 text-gray-600 text-xs">No waves scheduled yet</div>
      </div>
    );
  }

  const toggleWave = (idx: number) => {
    setCollapsedWaves((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
      <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Timeline</h2>
      <div className="space-y-2">
        {waves.map((wave) => {
          const completed = wave.tasks.filter((t) => t.status === "completed").length;
          const total = wave.tasks.length;
          const isActive = wave.status === "active";
          const isDone = wave.status === "completed";
          const isFailed = wave.status === "failed";
          const isCollapsed = collapsedWaves.has(wave.index);
          return (
            <div key={wave.index} className={`rounded-lg border transition-colors ${isActive ? "border-violet-500/30 bg-violet-500/5" : isDone ? "border-gray-800 bg-gray-800/20" : isFailed ? "border-rose-500/20 bg-rose-500/5" : "border-gray-800 bg-gray-800/30"}`}>
              <button onClick={() => toggleWave(wave.index)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-violet-500 animate-pulse" : isDone ? "bg-emerald-500" : isFailed ? "bg-rose-500" : "bg-gray-600"}`} />
                  <span className="text-xs font-semibold text-gray-300">Wave {wave.index + 1}</span>
                  <span className="text-[10px] text-gray-600 font-mono">{completed}/{total} {isDone ? "\u2713" : isFailed ? "\u2717" : ""}</span>
                </div>
                <span className="text-[10px] text-gray-700">{isCollapsed ? "\u25BC" : "\u25B2"}</span>
              </button>
              {!isCollapsed && (
                <div className="px-3 pb-2 space-y-0.5">
                  {wave.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 text-xs py-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${taskDot[task.status]}`} />
                      <span className={`truncate ${task.status === "completed" ? "text-gray-500" : task.status === "working" ? "text-violet-300" : task.status === "failed" ? "text-rose-400" : "text-gray-400"}`}>{task.title}</span>
                      <span className="text-gray-700 text-[10px] ml-auto flex-shrink-0 font-mono">{task.assignedTo}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}