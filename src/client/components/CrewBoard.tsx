import type { AgentState } from "@shared/types";

interface CrewBoardProps {
  agents: AgentState[];
}

const AVATAR_COLORS = [
  "violet",
  "blue",
  "cyan",
  "emerald",
  "amber",
  "rose",
  "pink",
  "indigo",
] as const;

type AvatarColor = (typeof AVATAR_COLORS)[number];

function agentColor(name: string): AvatarColor {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const avatarBg: Record<AvatarColor, string> = {
  violet: "bg-violet-500/20 text-violet-400",
  blue: "bg-blue-500/20 text-blue-400",
  cyan: "bg-cyan-500/20 text-cyan-400",
  emerald: "bg-emerald-500/20 text-emerald-400",
  amber: "bg-amber-500/20 text-amber-400",
  rose: "bg-rose-500/20 text-rose-400",
  pink: "bg-pink-500/20 text-pink-400",
  indigo: "bg-indigo-500/20 text-indigo-400",
};

const statusBadgeStyle: Record<AgentState["status"], string> = {
  active:
    "bg-violet-500/10 text-violet-400 border border-violet-500/30",
  retrying:
    "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  idle: "bg-gray-800 text-gray-500 border border-gray-700",
  completed:
    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  failed:
    "bg-rose-500/10 text-rose-400 border border-rose-500/30",
};

const cardBorder: Record<AgentState["status"], string> = {
  active: "border-l-violet-500",
  retrying: "border-l-amber-500",
  idle: "border-l-gray-700",
  completed: "border-l-emerald-500",
  failed: "border-l-rose-500",
};

const statusOrder: Record<AgentState["status"], number> = {
  active: 0,
  retrying: 1,
  idle: 2,
  completed: 3,
  failed: 4,
};

export function CrewBoard({ agents }: CrewBoardProps) {
  const sorted = [...agents].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  );

  return (
    <div className="rounded-lg bg-gray-900/80 border border-gray-800 backdrop-blur-sm p-3">
      <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
        Agents
      </h2>
      {sorted.length === 0 ? (
        <div className="text-center py-4 text-gray-600 text-xs">
          No agents registered
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((agent) => {
            const color = agentColor(agent.name);
            const isActive = agent.status === "active";
            const isDone = agent.status === "completed";
            return (
              <div
                key={agent.name}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border-l-2 transition-colors ${cardBorder[agent.status]} ${isActive ? "bg-violet-500/5" : "bg-gray-800/40"}`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${avatarBg[color]}`}
                >
                  {agent.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-semibold truncate ${isDone ? "text-gray-500" : "text-gray-200"}`}
                  >
                    {agent.name}
                  </div>
                  {agent.currentTask && (
                    <div className="text-[10px] text-gray-600 truncate">
                      {agent.currentTask}
                    </div>
                  )}
                  {agent.role && (
                    <div className="text-[9px] text-gray-700 truncate">
                      {agent.role}
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${statusBadgeStyle[agent.status]}`}
                  >
                    {agent.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}