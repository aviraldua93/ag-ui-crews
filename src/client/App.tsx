import { useCallback, useEffect, useMemo } from "react";
import { useEventStream, connectToBridge, fetchState, startSimulation, stopSession } from "./hooks/useEventStream";
import { useCrewState } from "./hooks/useCrewState";
import { Header } from "./components/Header";
import { HeroLanding } from "./components/HeroLanding";
import { PlanView } from "./components/PlanView";
import { CrewBoard } from "./components/CrewBoard";
import { WaveTimeline } from "./components/WaveTimeline";
import { ArtifactViewer } from "./components/ArtifactViewer";
import { EventLog } from "./components/EventLog";
import { MetricsBar } from "./components/MetricsBar";

const STORAGE_KEY = "ag-ui-crews:bridgeUrl";

export function App() {
  const { state, isConnected, error, connect, reset, dispatch } = useEventStream();
  const { elapsedTime, completionPercent } = useCrewState(state);

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

  if (isIdle) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
        <header className="flex items-center px-4 h-[44px] bg-gray-950 border-b border-gray-800/50 flex-shrink-0">
          <span className="text-xs text-gray-600">ag-ui-crews</span>
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
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-8 space-y-3">
            <PlanView plan={state.plan} phase={state.phase} />
            <WaveTimeline waves={state.waves} />
          </div>
          <div className="col-span-4 space-y-3">
            <MetricsBar
              metrics={state.metrics}
              elapsedTime={elapsedTime}
              wavesDone={wavesDone}
              wavesTotal={state.waves.length}
            />
            <CrewBoard agents={state.agents} />
          </div>
        </div>
        <ArtifactViewer artifacts={state.artifacts} />
        <EventLog events={state.eventLog} />
      </div>
    </div>
  );
}