import { useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEventStream, connectToBridge, startSimulation, stopSession } from "./hooks/useEventStream";
import { useCrewState } from "./hooks/useCrewState";
import { Header } from "./components/Header";
import { HeroLanding } from "./components/HeroLanding";
import { PlanView } from "./components/PlanView";
import { CrewBoard } from "./components/CrewBoard";
import { WaveTimeline } from "./components/WaveTimeline";
import { ArtifactViewer } from "./components/ArtifactViewer";
import { EventLog } from "./components/EventLog";
import { MetricsBar } from "./components/MetricsBar";

export function App() {
  const { state, isConnected, error, connect, reset } = useEventStream();
  const { elapsedTime, completionPercent } = useCrewState(state);

  const handleConnect = useCallback(
    async (url: string) => {
      connect();
      try {
        await connectToBridge(url);
      } catch {
        // SSE will handle reconnection
      }
    },
    [connect]
  );

  const handleSimulate = useCallback(async () => {
    connect();
    try {
      await startSimulation();
    } catch {
      // SSE will handle reconnection
    }
  }, [connect]);

  const handleStop = useCallback(async () => {
    try {
      await stopSession();
    } catch {
      // ignore
    }
    reset();
  }, [reset]);

  const isIdle = state.phase === "idle";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <Header
        phase={state.phase}
        isConnected={isConnected}
        elapsedTime={elapsedTime}
        error={error}
        onConnect={handleConnect}
        onSimulate={handleSimulate}
        onStop={handleStop}
        completionPercent={completionPercent}
        totalTasks={state.metrics.taskCount || state.tasks.length}
        completedTasks={state.metrics.completedTasks}
      />

      <AnimatePresence mode="wait">
        {isIdle ? (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex"
          >
            <HeroLanding
              onConnect={handleConnect}
              onSimulate={handleSimulate}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 overflow-auto p-4 space-y-3"
          >
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-8 space-y-3">
                <PlanView plan={state.plan} phase={state.phase} />
                <WaveTimeline waves={state.waves} />
              </div>
              <div className="col-span-4 space-y-3">
                <CrewBoard agents={state.agents} />
                <MetricsBar
                  metrics={state.metrics}
                  elapsedTime={elapsedTime}
                  completionPercent={completionPercent}
                />
              </div>
            </div>
            <ArtifactViewer artifacts={state.artifacts} />
            <EventLog events={state.eventLog} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
