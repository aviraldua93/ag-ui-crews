import { motion } from "framer-motion";
import { Waves, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { WaveState, TaskStatus } from "@shared/types";

interface WaveTimelineProps {
  waves: WaveState[];
}

const taskStatusColor: Record<TaskStatus, string> = {
  pending: "bg-gray-700 text-gray-400 border-gray-600/50",
  submitted: "bg-gray-700 text-gray-300 border-gray-600/50",
  working: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  failed: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  canceled: "bg-gray-800 text-gray-500 border-gray-700/50",
};

const waveStatusBorder: Record<WaveState["status"], string> = {
  pending: "border-gray-700/50",
  active: "border-sky-500/50 shadow-sky-500/10 shadow-lg",
  completed: "border-emerald-500/30",
  failed: "border-rose-500/30",
};

function WaveProgressBar({ wave }: { wave: WaveState }) {
  const total = wave.tasks.length;
  const completed = wave.tasks.filter((t) => t.status === "completed").length;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  return (
    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${
          wave.status === "failed"
            ? "bg-rose-500"
            : wave.status === "completed"
              ? "bg-emerald-500"
              : "bg-sky-500"
        }`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

export function WaveTimeline({ waves }: WaveTimelineProps) {
  if (waves.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Wave Timeline
        </h2>
        <div className="text-center py-8 text-gray-600 text-sm">
          <Waves className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No waves scheduled yet
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Wave Timeline
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {waves.map((wave, i) => {
          const isActive = wave.status === "active";
          return (
            <motion.div
              key={wave.index}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex-shrink-0 min-w-[200px] rounded-xl border ${waveStatusBorder[wave.status]} bg-gray-800/40 p-4 ${
                isActive ? "ring-1 ring-sky-500/20" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {wave.status === "active" && (
                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                  )}
                  {wave.status === "completed" && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  {wave.status === "failed" && (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  {wave.status === "pending" && (
                    <Waves className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  <span className="text-sm font-semibold text-gray-200">
                    Wave {wave.index + 1}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">
                  {wave.tasks.filter((t) => t.status === "completed").length}/{wave.tasks.length}
                </span>
              </div>

              <WaveProgressBar wave={wave} />

              <div className="mt-3 space-y-2">
                {wave.tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    className={`rounded-lg border px-3 py-2 text-xs ${taskStatusColor[task.status]} ${
                      task.status === "working" ? "animate-pulse" : ""
                    }`}
                  >
                    <div className="font-medium truncate">{task.title}</div>
                    <div className="text-[10px] opacity-60 mt-0.5 truncate">
                      → {task.assignedTo}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {waves.length > 1 && (
        <div className="flex items-center gap-2 mt-3 px-2">
          {waves.map((wave, i) => (
            <div key={wave.index} className="flex items-center">
              <div
                className={`w-3 h-3 rounded-full ${
                  wave.status === "completed"
                    ? "bg-emerald-500"
                    : wave.status === "active"
                      ? "bg-sky-500 animate-pulse"
                      : wave.status === "failed"
                        ? "bg-rose-500"
                        : "bg-gray-700"
                }`}
              />
              {i < waves.length - 1 && (
                <div
                  className={`h-0.5 w-8 ${
                    wave.status === "completed"
                      ? "bg-emerald-500/50"
                      : "bg-gray-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
