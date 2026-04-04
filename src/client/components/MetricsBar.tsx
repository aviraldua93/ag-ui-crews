import { motion } from "framer-motion";
import type { CrewMetrics } from "@shared/types";

interface MetricsBarProps {
  metrics: CrewMetrics;
  elapsedTime: number;
  completionPercent: number;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface MetricProps {
  value: string | number;
  label: string;
}

function Metric({ value, label }: MetricProps) {
  return (
    <div>
      <motion.div
        key={String(value)}
        initial={{ opacity: 0.6, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-semibold font-mono text-gray-100 leading-none"
      >
        {value}
      </motion.div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

export function MetricsBar({ metrics, elapsedTime, completionPercent }: MetricsBarProps) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Metrics
      </h2>

      {/* Completion bar */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-2xl font-semibold font-mono text-gray-100">
            {completionPercent}%
          </span>
          <span className="text-xs text-gray-600 font-mono">
            {metrics.completedTasks}/{metrics.taskCount || "—"}
          </span>
        </div>
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              completionPercent === 100 ? "bg-emerald-500" : "bg-violet-500"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${completionPercent}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mt-1">
          Tasks complete
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4">
        <Metric value={metrics.agentCount} label="Agents" />
        <Metric value={metrics.waveCount} label="Waves" />
        <Metric value={metrics.retryCount} label="Retries" />
        <Metric value={formatElapsed(elapsedTime)} label="Elapsed" />
      </div>

      {/* Failed count if any */}
      {metrics.failedTasks > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <span className="text-xs text-rose-400 font-mono">{metrics.failedTasks}</span>
          <span className="text-[10px] text-gray-600 ml-1">failed</span>
        </div>
      )}
    </div>
  );
}
