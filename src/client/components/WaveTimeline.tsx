import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

const taskText: Record<TaskStatus, string> = {
  pending: "text-gray-500",
  submitted: "text-gray-400",
  working: "text-violet-400",
  completed: "text-emerald-400",
  failed: "text-rose-400",
  canceled: "text-gray-600",
};

export function WaveTimeline({ waves }: WaveTimelineProps) {
  if (waves.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Waves
        </h2>
        <div className="text-center py-6 text-gray-600 text-xs">
          No waves scheduled yet
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Waves
      </h2>

      {/* Progress dots */}
      {waves.length > 1 && (
        <div className="flex items-center gap-1 mb-4 px-1">
          {waves.map((wave, i) => (
            <div key={wave.index} className="flex items-center">
              <div className={`w-2 h-2 rounded-full ${
                wave.status === "completed" ? "bg-emerald-500" :
                wave.status === "active" ? "bg-violet-500 animate-pulse" :
                wave.status === "failed" ? "bg-rose-500" :
                "bg-gray-700"
              }`} />
              {i < waves.length - 1 && (
                <div className={`h-px w-6 ${
                  wave.status === "completed" ? "bg-emerald-500/40" : "bg-gray-800"
                }`} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {waves.map((wave, i) => {
          const completed = wave.tasks.filter((t) => t.status === "completed").length;
          const total = wave.tasks.length;
          const pct = total > 0 ? (completed / total) * 100 : 0;

          return (
            <motion.div
              key={wave.index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              className={`rounded-lg border p-3 ${
                wave.status === "active"
                  ? "border-violet-500/30 bg-violet-500/5"
                  : "border-gray-800 bg-gray-800/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {wave.status === "active" && <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />}
                  {wave.status === "completed" && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                  {wave.status === "failed" && <XCircle className="w-3 h-3 text-rose-500" />}
                  <span className="text-xs font-semibold text-gray-300">
                    Wave {wave.index + 1}
                  </span>
                </div>
                <span className="text-[10px] text-gray-600 font-mono">
                  {completed}/{total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden mb-2">
                <motion.div
                  className={`h-full rounded-full ${
                    wave.status === "failed" ? "bg-rose-500" :
                    wave.status === "completed" ? "bg-emerald-500" :
                    "bg-violet-500"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              {/* Tasks */}
              <div className="space-y-1">
                {wave.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-1 h-1 rounded-full flex-shrink-0 ${taskDot[task.status]}`} />
                    <span className={`truncate ${taskText[task.status]}`}>
                      {task.title}
                    </span>
                    <span className="text-gray-700 text-[10px] ml-auto flex-shrink-0">
                      {task.assignedTo}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
