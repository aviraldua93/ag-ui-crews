import { Wifi, WifiOff } from "lucide-react";

interface StatusBarProps {
  isConnected: boolean;
  agentCount: number;
  activeAgents: number;
  completedTasks: number;
  totalTasks: number;
  wavesDone: number;
  wavesTotal: number;
}

export function StatusBar({
  isConnected,
  agentCount,
  activeAgents,
  completedTasks,
  totalTasks,
  wavesDone,
  wavesTotal,
}: StatusBarProps) {
  return (
    <footer className="h-[24px] bg-gray-950 border-t border-gray-800/60 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: connection status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-mono text-emerald-500">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-gray-600" />
              <span className="text-[10px] font-mono text-gray-600">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* Right: counts */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
        <span>
          agents:<span className="text-gray-400">{activeAgents}</span>/{agentCount}
        </span>
        <span>
          tasks:<span className="text-gray-400">{completedTasks}</span>/{totalTasks}
        </span>
        <span>
          waves:<span className="text-gray-400">{wavesDone}</span>/{wavesTotal}
        </span>
      </div>
    </footer>
  );
}
