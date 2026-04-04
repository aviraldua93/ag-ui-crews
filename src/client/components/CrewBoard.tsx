import { motion } from "framer-motion";
import { User, Code, Palette, Search, Shield, RotateCcw } from "lucide-react";
import type { AgentState } from "@shared/types";

interface CrewBoardProps {
  agents: AgentState[];
}

const statusConfig: Record<
  AgentState["status"],
  { color: string; border: string; bg: string; text: string }
> = {
  idle: {
    color: "bg-gray-500",
    border: "border-gray-700/50",
    bg: "bg-gray-800/60",
    text: "text-gray-400",
  },
  active: {
    color: "bg-sky-500",
    border: "border-sky-500/30",
    bg: "bg-sky-500/5",
    text: "text-sky-400",
  },
  completed: {
    color: "bg-emerald-500",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    text: "text-emerald-400",
  },
  failed: {
    color: "bg-rose-500",
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    text: "text-rose-400",
  },
  retrying: {
    color: "bg-amber-500",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    text: "text-amber-400",
  },
};

const roleIcons: Record<string, typeof User> = {
  planner: Search,
  developer: Code,
  designer: Palette,
  researcher: Search,
  reviewer: Shield,
  tester: Shield,
  default: User,
};

function getRoleIcon(role: string) {
  const key = role.toLowerCase();
  for (const [k, Icon] of Object.entries(roleIcons)) {
    if (k !== "default" && key.includes(k)) return Icon;
  }
  return roleIcons.default;
}

export function CrewBoard({ agents }: CrewBoardProps) {
  if (agents.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Crew Board
        </h2>
        <div className="text-center py-8 text-gray-600 text-sm">
          <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No agents registered yet
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Crew Board
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {agents.map((agent) => {
          const s = statusConfig[agent.status];
          const Icon = getRoleIcon(agent.role);
          return (
            <motion.div
              key={agent.name}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className={`rounded-lg p-3 border ${s.border} ${s.bg} transition-colors`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg ${s.bg} border ${s.border} flex items-center justify-center flex-shrink-0`}
                >
                  <Icon className={`w-4 h-4 ${s.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {agent.name}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${s.color} flex-shrink-0 ${
                        agent.status === "active" ? "animate-pulse" : ""
                      }`}
                    />
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {agent.role}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {agent.retryCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <RotateCcw className="w-3 h-3" />
                      {agent.retryCount}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${s.text} ${s.bg} border ${s.border}`}
                  >
                    {agent.status}
                  </span>
                </div>
              </div>
              {agent.currentTask && (
                <div className="mt-2 pl-11 text-xs text-gray-500 truncate">
                  Working on: {agent.currentTask}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
