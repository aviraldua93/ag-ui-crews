import type { AgentState } from "@shared/types";

interface CrewBoardProps {
  agents: AgentState[];
}

const statusDot: Record<AgentState["status"], string> = {
  idle: "bg-gray-500",
  active: "bg-violet-500 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  retrying: "bg-amber-500 animate-pulse",
};

const statusBadge: Record<AgentState["status"], string> = {
  idle: "text-gray-500",
  active: "text-violet-400",
  completed: "text-emerald-400",
  failed: "text-rose-400",
  retrying: "text-amber-400",
};

const statusOrder: Record<AgentState["status"], number> = {
  active: 0, retrying: 1, idle: 2, completed: 3, failed: 4,
};

export function CrewBoard({ agents }: CrewBoardProps) {
  const sorted = [...agents].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
      <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Agents</h2>
      {sorted.length === 0 ? (
        <div className="text-center py-4 text-gray-600 text-xs">No agents registered</div>
      ) : (
        <div className="space-y-1">
          {sorted.map((agent) => (
            <div key={agent.name} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800/50 transition-colors">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot[agent.status]}`} />
              <span className="text-xs font-mono text-gray-200 truncate min-w-0">{agent.name}</span>
              {agent.currentTask && <span className="text-[10px] text-gray-600 truncate min-w-0 flex-1">{agent.currentTask}</span>}
              <span className={`text-[10px] uppercase tracking-wider flex-shrink-0 ml-auto ${statusBadge[agent.status]}`}>{agent.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}