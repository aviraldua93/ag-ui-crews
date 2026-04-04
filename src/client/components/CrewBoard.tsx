import { motion } from "framer-motion";
import { User, Code, Palette, Search, Shield, RotateCcw } from "lucide-react";
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

const statusLabel: Record<AgentState["status"], string> = {
  idle: "text-gray-500",
  active: "text-violet-400",
  completed: "text-emerald-400",
  failed: "text-rose-400",
  retrying: "text-amber-400",
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
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Crew
      </h2>

      {agents.length === 0 ? (
        <div className="text-center py-6 text-gray-600 text-xs">
          No agents registered yet
        </div>
      ) : (
        <div className="space-y-1.5">
          {agents.map((agent) => {
            const Icon = getRoleIcon(agent.role);
            return (
              <motion.div
                key={agent.name}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-lg bg-gray-800/50 border border-gray-800 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-200 truncate">
                        {agent.name}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot[agent.status]}`} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-600 truncate">{agent.role}</span>
                      <span className={`text-[10px] uppercase tracking-wider ${statusLabel[agent.status]}`}>
                        {agent.status}
                      </span>
                      {agent.retryCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                          <RotateCcw className="w-2.5 h-2.5" />
                          {agent.retryCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {agent.currentTask && (
                  <div className="mt-1.5 pl-6 text-xs text-gray-500 truncate">
                    → {agent.currentTask}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
