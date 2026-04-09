import { useCallback, useEffect, useMemo } from "react";
import { Sun, Moon } from "lucide-react";
import { useEventStream, connectToBridge, fetchState, startSimulation, stopSession } from "./hooks/useEventStream";
import { useCrewState } from "./hooks/useCrewState";
import { useTheme } from "./hooks/useTheme";
import { Header } from "./components/Header";
import { HeroLanding } from "./components/HeroLanding";
import { PlanView } from "./components/PlanView";
import { CrewBoard } from "./components/CrewBoard";
import { WaveTimeline } from "./components/WaveTimeline";
import { ArtifactViewer } from "./components/ArtifactViewer";
import { EventLog } from "./components/EventLog";
import { MetricsBar } from "./components/MetricsBar";
import { StatusBar } from "./components/StatusBar";
import { WorktreePanel } from "./components/WorktreePanel";

const STORAGE_KEY = "ag-ui-crews:bridgeUrl";

export function App() {
  const { state, isConnected, error, connect, reset, dispatch } = useEventStream();
  const { elapsedTime, completionPercent } = useCrewState(state);
  const { theme, toggleTheme } = useTheme();

  const handleConnect = useCallback(
    async (url: string) => {
      try {
        await connectToBridge(url);
        localStorage.setItem(STORAGE_KEY, url);
        connect();
      } catch { /* SSE handles reconnection */ }
    },
    [connect]
  );

  // Auto-reconnect on page refresh
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && state.phase === "idle") {
      handleConnect(saved);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSimulate = useCallback(async () => {
    try {
      await startSimulation();
      connect();
    } catch { /* SSE handles reconnection */ }
  }, [connect]);

  const handleStop = useCallback(async () => {
    try {
      await stopSession();
    } catch { /* ignore */ }
    localStorage.removeItem(STORAGE_KEY);
    reset();
  }, [reset]);

  const handleDisconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    reset();
  }, [reset]);

  const handleRefresh = useCallback(async () => {
    const snapshot = await fetchState();
    if (snapshot) dispatch({ type: "STATE_SNAPSHOT", state: snapshot });
  }, [dispatch]);

  const isIdle = state.phase === "idle";

  const wavesDone = useMemo(
    () => state.waves.filter((w) => w.status === "completed").length,
    [state.waves]
  );

  const activeAgents = useMemo(
    () => state.agents.filter((a) => a.status === "active").length,
    [state.agents]
  );

  if (isIdle) {
    return (
      <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <header className="flex items-center justify-between px-4 h-[44px] bg-gray-100 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800/50 flex-shrink-0">
          <span className="text-xs font-semibold tracking-wide text-gray-400">ag-ui-crews</span>
          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          </button>
        </header>
        <HeroLanding onConnect={handleConnect} onSimulate={handleSimulate} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <Header
        phase={state.phase}
        elapsedTime={elapsedTime}
        onStop={handleStop}
        onRefresh={handleRefresh}
        totalTasks={state.metrics.taskCount || state.tasks.length}
        completedTasks={state.metrics.completedTasks}
      />

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Main 2-column layout */}
        <div className="grid grid-cols-12 gap-3">
          {/* Left: Hero area — Waves + Tasks */}
          <div className="col-span-8 space-y-3">
            <WaveTimeline waves={state.waves} />
          </div>

          {/* Right: Metrics + Agents + Plan */}
          <div className="col-span-4 space-y-3">
            <MetricsBar
              metrics={state.metrics}
              elapsedTime={elapsedTime}
              wavesDone={wavesDone}
              wavesTotal={state.waves.length}
            />
            <CrewBoard agents={state.agents} />
            <WorktreePanel worktrees={state.worktrees} />
            <PlanView plan={state.plan} phase={state.phase} />
          </div>
        </div>

        {/* Full-width: Artifacts + Console */}
        <ArtifactViewer artifacts={state.artifacts} />
        <EventLog events={state.eventLog} />
      </div>

      <StatusBar
        isConnected={isConnected}
        agentCount={state.agents.length}
        activeAgents={activeAgents}
        completedTasks={state.metrics.completedTasks}
        totalTasks={state.metrics.taskCount || state.tasks.length}
        wavesDone={wavesDone}
        wavesTotal={state.waves.length}
      />
    </div>
  );
}