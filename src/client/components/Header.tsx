import { useState, useCallback } from "react";
import { Radio, Play, Square, Clock, Wifi, WifiOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { DashboardPhase } from "@shared/types";

interface HeaderProps {
  phase: DashboardPhase;
  isConnected: boolean;
  elapsedTime: number;
  error: string | null;
  onConnect: (url: string) => void;
  onSimulate: () => void;
  onStop: () => void;
}

const phaseConfig: Record<DashboardPhase, { label: string; color: string }> = {
  idle: { label: "Idle", color: "bg-gray-600" },
  connecting: { label: "Connecting", color: "bg-amber-500" },
  planning: { label: "Planning", color: "bg-violet-500" },
  executing: { label: "Executing", color: "bg-sky-500" },
  completed: { label: "Completed", color: "bg-emerald-500" },
  error: { label: "Error", color: "bg-rose-500" },
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Header({
  phase,
  isConnected,
  elapsedTime,
  error,
  onConnect,
  onSimulate,
  onStop,
}: HeaderProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://localhost:8000");
  const p = phaseConfig[phase];

  const handleConnect = useCallback(() => {
    if (showUrlInput) {
      onConnect(bridgeUrl);
      setShowUrlInput(false);
    } else {
      setShowUrlInput(true);
    }
  }, [showUrlInput, bridgeUrl, onConnect]);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800/50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-semibold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            ag-ui-crews
          </h1>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-emerald-400 shadow-emerald-400/50 shadow-sm"
                : error
                  ? "bg-rose-400 shadow-rose-400/50 shadow-sm"
                  : phase === "connecting"
                    ? "bg-amber-400 animate-pulse shadow-amber-400/50 shadow-sm"
                    : "bg-gray-500"
            }`}
          />
          <span className="text-xs text-gray-400">
            {isConnected ? "Connected" : error ? "Error" : phase === "connecting" ? "Connecting…" : "Disconnected"}
          </span>
        </div>

        <motion.span
          layout
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${p.color}`}
        >
          {p.label}
        </motion.span>
      </div>

      <div className="flex items-center gap-4">
        {phase !== "idle" && (
          <div className="flex items-center gap-1.5 text-gray-400 font-mono text-sm">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTime(elapsedTime)}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {showUrlInput && (
            <motion.input
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Bridge URL…"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
                if (e.key === "Escape") setShowUrlInput(false);
              }}
              autoFocus
            />
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <button
            onClick={handleConnect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            Connect
          </button>
          <button
            onClick={onSimulate}
            disabled={phase === "executing" || phase === "planning"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {phase === "executing" || phase === "planning" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Simulate
          </button>
          <button
            onClick={onStop}
            disabled={phase === "idle"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            Stop
          </button>
        </div>
      </div>
    </header>
  );
}
