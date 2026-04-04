import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Target,
  ArrowRight,
} from "lucide-react";
import type { CrewPlan, FeasibilityVerdict } from "@shared/types";

interface PlanViewProps {
  plan: CrewPlan | null;
  phase: string;
}

const verdictConfig: Record<
  FeasibilityVerdict,
  { label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
  go: {
    label: "GO",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  risky: {
    label: "RISKY",
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  "no-go": {
    label: "NO-GO",
    icon: XCircle,
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/30",
  },
};

function ProgressBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-500 font-mono">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-16 h-6 bg-gray-800 rounded-full animate-pulse" />
        <div className="w-48 h-5 bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="w-full h-4 bg-gray-800 rounded animate-pulse" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-20 bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-full h-3 bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function PlanView({ plan, phase }: PlanViewProps) {
  if (!plan) {
    if (phase === "planning") {
      return <Skeleton />;
    }
    return null;
  }

  const v = verdictConfig[plan.feasibility.verdict];
  const VerdictIcon = v.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${v.bg} ${v.color}`}
            >
              <VerdictIcon className="w-3.5 h-3.5" />
              {v.label}
            </span>
            <span className="text-xs text-gray-500 font-mono">
              {Math.round(plan.feasibility.confidence * 100)}% confidence
            </span>
          </div>
          <h2 className="text-lg font-semibold text-gray-100 mb-1">
            <Target className="w-4 h-4 inline mr-2 text-violet-400" />
            {plan.scenario}
          </h2>
          {plan.template && (
            <span className="text-xs text-gray-500">Template: {plan.template}</span>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-5 overflow-x-auto pb-1">
        {plan.roles.map((role, i) => (
          <motion.div
            key={role.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex-shrink-0 min-w-[140px] bg-gray-800/60 rounded-lg p-3 border border-gray-700/50"
          >
            <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-1">
              {role.key}
            </div>
            <div className="text-xs text-gray-400 line-clamp-2">
              {role.description}
            </div>
            {role.model && (
              <div className="text-[10px] text-gray-600 mt-1 font-mono">
                {role.model}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mb-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Task Flow
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {plan.tasks.map((task, i) => (
            <div key={task.id} className="flex items-center flex-shrink-0">
              <div className="bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-gray-300">{task.title}</span>
                <div className="text-[10px] text-gray-500 mt-0.5">→ {task.assignedTo}</div>
              </div>
              {i < plan.tasks.length - 1 && (
                <ArrowRight className="w-3 h-3 text-gray-600 mx-1 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ProgressBar
          value={plan.feasibility.technical}
          label="Technical"
          color="bg-sky-500"
        />
        <ProgressBar
          value={plan.feasibility.scope}
          label="Scope"
          color="bg-violet-500"
        />
        <ProgressBar
          value={plan.feasibility.risk}
          label="Risk"
          color="bg-amber-500"
        />
      </div>

      {plan.feasibility.concerns.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {plan.feasibility.concerns.map((c, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
