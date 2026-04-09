import { X, RefreshCw, Sun, Moon } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
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

function scenarioLabel(
  phase: DashboardPhase,
  completedTasks?: number,
  totalTasks?: number,
): string {
  switch (phase) {
    case "connecting":
      return "Connecting…";
    case "planning":
      return "Planning…";
    case "executing":
      if (totalTasks && totalTasks > 0)
        return `${completedTasks ?? 0} of ${totalTasks} tasks`;
      return "Executing…";
    case "completed":
      return "Complete";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export function Header({
  phase,
  elapsedTime,
  onStop,
  onRefresh,
  totalTasks,
  completedTasks,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const isActive = phase !== "idle";
  const pct =
    totalTasks && totalTasks > 0
      ? Math.round(((completedTasks ?? 0) / totalTasks) * 100)
      : 0;
  const isDone = phase === "completed";

  return (
    <header className="flex-shrink-0 relative">
      <div className="flex items-center justify-between px-4 h-[44px] bg-gray-100 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800/50">
        {/* Left: logo */}
        <span className="text-xs font-semibold tracking-wide text-gray-400">
          ag-ui-crews
        </span>

        {/* Center: scenario + inline progress */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5">
          <span className="text-[11px] text-gray-300 font-medium truncate max-w-[280px]">
            {scenarioLabel(phase, completedTasks, totalTasks)}
          </span>
          {isActive && totalTasks !== undefined && totalTasks > 0 && (
            <div className="w-32 h-[3px] rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${isDone ? "bg-emerald-500" : "bg-violet-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        {/* Right: time + controls */}
        <div className="flex items-center gap-3">
          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          </button>
          {isActive && elapsedTime > 0 && (
            <span className="text-[11px] text-gray-500 font-mono tabular-nums">
              {formatTime(elapsedTime)}
            </span>
          )}
          {isActive && onRefresh && (
            <button
              onClick={onRefresh}
              className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors"
              title="Refresh state"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
          {isActive && (
            <button
              onClick={onStop}
              className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-rose-400 transition-colors"
              title="Disconnect"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom progress bar — 2px accent strip */}
      {isActive && totalTasks !== undefined && totalTasks > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-800/60">
          <div
            className={`h-full transition-all duration-700 ease-out ${isDone ? "bg-emerald-500" : "bg-violet-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </header>
  );
}