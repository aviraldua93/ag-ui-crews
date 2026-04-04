import { X, RefreshCw } from "lucide-react";
import type { DashboardPhase } from "@shared/types";

interface HeaderProps {
  phase: DashboardPhase;
  elapsedTime: number;
  onStop: () => void;
  onRefresh?: () => void;
  totalTasks?: number;
  completedTasks?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function phaseText(
  phase: DashboardPhase,
  completedTasks?: number,
  totalTasks?: number
): string {
  switch (phase) {
    case "connecting": return "Connecting\u2026";
    case "planning": return "Planning\u2026";
    case "executing":
      if (totalTasks && totalTasks > 0) return `${completedTasks ?? 0} of ${totalTasks} tasks complete`;
      return "Executing\u2026";
    case "completed": return "Complete";
    case "error": return "Error";
    default: return "";
  }
}

export function Header({ phase, elapsedTime, onStop, onRefresh, totalTasks, completedTasks }: HeaderProps) {
  const isActive = phase !== "idle";
  return (
    <header className="flex items-center justify-between px-4 h-[44px] bg-gray-950 border-b border-gray-800/50 flex-shrink-0">
      <span className="text-xs text-gray-600">ag-ui-crews</span>
      <span className="text-xs text-gray-400">{phaseText(phase, completedTasks, totalTasks)}</span>
      <div className="flex items-center gap-3">
        {isActive && elapsedTime > 0 && (
          <span className="text-xs text-gray-500 font-mono">{formatTime(elapsedTime)}</span>
        )}
        {isActive && onRefresh && (
          <button onClick={onRefresh} className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors" title="Refresh state">
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        {isActive && (
          <button onClick={onStop} className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-rose-400 transition-colors" title="Disconnect">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
}