import { useMemo, useState, useEffect } from "react";
import type { DashboardState, AgentState, WaveState, TaskState } from "@shared/types";

export interface DerivedCrewState {
  activeWave: WaveState | null;
  completionPercent: number;
  elapsedTime: number;
  agentsByStatus: Record<AgentState["status"], AgentState[]>;
  tasksByWave: Map<number, TaskState[]>;
}

export function useCrewState(state: DashboardState): DerivedCrewState {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!state.startedAt || state.phase === "idle" || state.phase === "completed") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.startedAt, state.phase]);

  const activeWave = useMemo(
    () => state.waves.find((w) => w.status === "active") ?? null,
    [state.waves]
  );

  const completionPercent = useMemo(() => {
    const total = state.tasks.length;
    if (total === 0) return 0;
    const completed = state.tasks.filter(
      (t) => t.status === "completed"
    ).length;
    return Math.round((completed / total) * 100);
  }, [state.tasks]);

  const elapsedTime = useMemo(() => {
    if (!state.startedAt) return 0;
    const elapsed = Math.floor((now - state.startedAt) / 1000);
    return Math.max(0, elapsed);
  }, [state.startedAt, now]);

  const agentsByStatus = useMemo(() => {
    const groups: Record<AgentState["status"], AgentState[]> = {
      idle: [],
      active: [],
      completed: [],
      failed: [],
      retrying: [],
    };
    for (const agent of state.agents) {
      groups[agent.status].push(agent);
    }
    return groups;
  }, [state.agents]);

  const tasksByWave = useMemo(() => {
    const map = new Map<number, TaskState[]>();
    for (const task of state.tasks) {
      const arr = map.get(task.wave) ?? [];
      arr.push(task);
      map.set(task.wave, arr);
    }
    return map;
  }, [state.tasks]);

  return { activeWave, completionPercent, elapsedTime, agentsByStatus, tasksByWave };
}
