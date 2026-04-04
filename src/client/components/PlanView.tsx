import { useState } from "react";
import type { CrewPlan, FeasibilityVerdict } from "@shared/types";

interface PlanViewProps {
  plan: CrewPlan | null;
  phase: string;
}

const verdictColor: Record<FeasibilityVerdict, string> = {
  go: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  risky: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "no-go": "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

export function PlanView({ plan, phase }: PlanViewProps) {
  const [expanded, setExpanded] = useState(false);

  if (!plan) {
    if (phase === "planning") {
      return (
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-5 bg-gray-800 rounded animate-pulse" />
            <div className="w-40 h-4 bg-gray-800 rounded animate-pulse" />
          </div>
        </div>
      );
    }
    return null;
  }

  const v = plan.feasibility;
  const pct = Math.round(v.confidence * 100);

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${verdictColor[v.verdict]}`}>
          {v.verdict.toUpperCase()} {pct}%
        </span>
        <span className="text-sm text-gray-200 truncate flex-1">{plan.scenario}</span>
        <span className="text-[10px] text-gray-600">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800">
          {plan.roles.length > 0 && (
            <div className="mt-3">
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Roles</h3>
              <div className="space-y-1">
                {plan.roles.map((role) => (
                  <div key={role.key} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                    <span className="font-mono text-violet-400">{role.key}</span>
                    <span className="text-gray-600 truncate">{role.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {plan.tasks.length > 0 && (
            <div className="mt-3">
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Tasks</h3>
              <div className="space-y-1">
                {plan.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-xs">
                    <span className="w-1 h-1 rounded-full bg-gray-600 flex-shrink-0" />
                    <span className="text-gray-300 truncate">{task.title}</span>
                    <span className="text-gray-700 text-[10px] ml-auto flex-shrink-0 font-mono">{task.assignedTo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {v.concerns.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {v.concerns.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}