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

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-semibold font-mono text-gray-100 leading-none">{value}</div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

export function MetricsBar({ metrics, elapsedTime, wavesDone, wavesTotal }: MetricsBarProps) {
  const taskStr = metrics.taskCount > 0 ? `${metrics.completedTasks}/${metrics.taskCount}` : "\u2014";
  const waveStr = wavesTotal > 0 ? `${wavesDone}/${wavesTotal}` : "\u2014";
  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
      <div className="grid grid-cols-4 gap-2">
        <Metric value={taskStr} label="Tasks" />
        <Metric value={String(metrics.agentCount)} label="Agents" />
        <Metric value={waveStr} label="Waves" />
        <Metric value={formatElapsed(elapsedTime)} label="Time" />
      </div>
    </div>
  );
}