import { useState, useCallback } from "react";
import { X, FlaskConical, Clock, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "../hooks/useTheme";
import type { DashboardPhase } from "@shared/types";

interface HeaderProps {
  phase: DashboardPhase;
  isConnected: boolean;
  elapsedTime: number;
  error: string | null;
  onConnect: (url: string) => void;
  onSimulate: () => void;
  onStop: () => void;
  completionPercent?: number;
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
  completionPercent?: number,
  completedTasks?: number,
  totalTasks?: number,
): string {
  switch (phase) {
    case "connecting":
      return "Connecting…";
    case "planning":
      return "Planning…";
    case "executing":
      if (totalTasks && totalTasks > 0) {
        return `${completedTasks ?? 0} of ${totalTasks} tasks complete`;
      }
      return "Executing…";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export function Header({
  phase,
  isConnected,
  elapsedTime,
  error,
  onConnect,
  onSimulate,
  onStop,
  completionPercent,
  totalTasks,
  completedTasks,
}: HeaderProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://localhost:8000");
  const { theme, toggleTheme } = useTheme();

  const handleUrlConnect = useCallback(() => {
    if (bridgeUrl.trim()) {
      onConnect(bridgeUrl.trim());
      setShowUrlInput(false);
    }
  }, [bridgeUrl, onConnect]);

  const isActive = phase !== "idle";
  const statusText = phaseText(phase, completionPercent, completedTasks, totalTasks);

  return (
    <header className="flex items-center justify-between px-5 h-12 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50 flex-shrink-0">
      {/* Left: wordmark */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 tracking-wide">
          ag-ui-crews
        </span>
        {isActive && (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            phase === "completed" ? "bg-emerald-500" :
            phase === "error" ? "bg-rose-500" :
            "bg-violet-500 animate-pulse"
          }`} />
        )}
      </div>

      {/* Center: phase text */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <AnimatePresence mode="wait">
          {statusText && (
            <motion.span
              key={statusText}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-gray-400"
            >
              {statusText}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Elapsed time when active */}
        {isActive && elapsedTime > 0 && (
          <span className="text-xs text-gray-600 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(elapsedTime)}
          </span>
        )}

        {/* URL input for manual connect */}
        <AnimatePresence>
          {showUrlInput && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <input
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-violet-500"
                value={bridgeUrl}
                onChange={(e) => setBridgeUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUrlConnect();
                  if (e.key === "Escape") setShowUrlInput(false);
                }}
                placeholder="Bridge URL…"
                autoFocus
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Simulate (dev tool) — tiny icon when idle */}
        {phase === "idle" && (
          <button
            onClick={onSimulate}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors"
            title="Run simulation (dev)"
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Theme toggle */}
        <button
          data-testid="theme-toggle"
          onClick={toggleTheme}
          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Moon className="w-3.5 h-3.5" />
          ) : (
            <Sun className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Disconnect when connected */}
        {isActive && (
          <button
            onClick={onStop}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 hover:text-rose-400 hover:bg-gray-800 transition-colors"
            title="Disconnect"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
}
