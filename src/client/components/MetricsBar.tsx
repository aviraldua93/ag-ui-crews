import { motion } from "framer-motion";
import { Users, ListChecks, Waves, RotateCcw, Clock } from "lucide-react";
import type { CrewMetrics } from "@shared/types";

interface MetricsBarProps {
  metrics: CrewMetrics;
  elapsedTime: number;
  completionPercent: number;
}

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  pct?: number;
}

function StatCard({ icon: Icon, label, value, sub, color, pct }: StatCardProps) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 p-4 flex items-center gap-3">
      <div className="relative flex-shrink-0">
        {pct !== undefined ? (
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-gray-700"
            />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="94.25"
              strokeLinecap="round"
              className={color}
              initial={{ strokeDashoffset: 94.25 }}
              animate={{ strokeDashoffset: 94.25 - (94.25 * pct) / 100 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </svg>
        ) : (
          <div className={`w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        )}
        {pct !== undefined && (
          <Icon className={`w-4 h-4 absolute inset-0 m-auto ${color}`} />
        )}
      </div>
      <div>
        <motion.div
          key={String(value)}
          initial={{ opacity: 0.5, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-bold text-gray-100 font-mono leading-tight"
        >
          {value}
        </motion.div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">
          {label}
        </div>
        {sub && (
          <div className="text-[10px] text-gray-600 font-mono">{sub}</div>
        )}
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MetricsBar({ metrics, elapsedTime, completionPercent }: MetricsBarProps) {
  return (
    <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Metrics
      </h2>
      <div className="grid grid-cols-1 gap-3">
        <StatCard
          icon={Users}
          label="Agents"
          value={metrics.agentCount}
          color="text-violet-400"
        />
        <StatCard
          icon={ListChecks}
          label="Tasks"
          value={`${metrics.completedTasks}/${metrics.taskCount || "—"}`}
          color="text-emerald-400"
          pct={completionPercent}
          sub={`${completionPercent}% complete`}
        />
        <StatCard
          icon={Waves}
          label="Waves"
          value={metrics.waveCount}
          color="text-sky-400"
        />
        <StatCard
          icon={RotateCcw}
          label="Retries"
          value={metrics.retryCount}
          color="text-amber-400"
        />
        <StatCard
          icon={Clock}
          label="Time"
          value={formatElapsed(elapsedTime)}
          color="text-gray-300"
        />
      </div>
    </div>
  );
}
