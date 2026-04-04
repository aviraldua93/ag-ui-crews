import { CheckCircle2, Users, Layers, Clock } from "lucide-react";
import type { CrewMetrics } from "@shared/types";

interface MetricsBarProps {
  metrics: CrewMetrics;
  elapsedTime: number;
  wavesDone: number;
  wavesTotal: number;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Pill({
  icon,
  value,
  className,
}: {
  icon: React.ReactNode;
  value: string;
  className: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium font-mono border ${className}`}
    >
      {icon}
      <span>{value}</span>
    </div>
  );
}

export function MetricsBar({
  metrics,
  elapsedTime,
  wavesDone,
  wavesTotal,
}: MetricsBarProps) {
  const allDone =
    metrics.taskCount > 0 && metrics.completedTasks >= metrics.taskCount;
  const taskStr =
    metrics.taskCount > 0
      ? `${metrics.completedTasks}/${metrics.taskCount} Tasks`
      : "— Tasks";
  const waveStr =
    wavesTotal > 0 ? `${wavesDone}/${wavesTotal} Waves` : "— Waves";

  return (
    <div className="rounded-lg bg-gray-900/80 border border-gray-800 backdrop-blur-sm p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Pill
          icon={<CheckCircle2 className="w-3 h-3" />}
          value={taskStr}
          className={
            allDone
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-violet-500/10 border-violet-500/30 text-violet-400"
          }
        />
        <Pill
          icon={<Users className="w-3 h-3" />}
          value={`${metrics.agentCount} Agents`}
          className="bg-blue-500/10 border-blue-500/30 text-blue-400"
        />
        <Pill
          icon={<Layers className="w-3 h-3" />}
          value={waveStr}
          className="bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
        />
        <Pill
          icon={<Clock className="w-3 h-3" />}
          value={formatElapsed(elapsedTime)}
          className="bg-gray-800 border-gray-700 text-gray-400"
        />
      </div>
    </div>
  );
}