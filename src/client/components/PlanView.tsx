import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
} from "lucide-react";
import type { CrewPlan, FeasibilityVerdict } from "@shared/types";

interface PlanViewProps {
  plan: CrewPlan | null;
  phase: string;
}

const verdictConfig: Record<
  FeasibilityVerdict,
  { label: string; icon: typeof CheckCircle2; color: string }
> = {
  go: { label: "GO", icon: CheckCircle2, color: "text-emerald-400" },
  risky: { label: "RISKY", icon: AlertTriangle, color: "text-amber-400" },
  "no-go": { label: "NO-GO", icon: XCircle, color: "text-rose-400" },
};

function ProgressBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-gray-600 uppercase tracking-wider">{label}</span>
        <span className="text-gray-500 font-mono">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-14 h-5 bg-gray-800 rounded animate-pulse" />
        <div className="w-40 h-4 bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="w-full h-3 bg-gray-800 rounded animate-pulse" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-16 bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function PlanView({ plan, phase }: PlanViewProps) {
  if (!plan) {
    if (phase === "planning") return <Skeleton />;
    return null;
  }

  const v = verdictConfig[plan.feasibility.verdict];
  const VerdictIcon = v.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl bg-gray-900 border border-gray-800 p-4"
    >
      {/* Verdict + scenario */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`flex items-center gap-1 text-xs font-semibold ${v.color}`}>
          <VerdictIcon className="w-3.5 h-3.5" />
          {v.label}
        </span>
        <span className="text-[10px] text-gray-600 font-mono">
          {Math.round(plan.feasibility.confidence * 100)}%
        </span>
      </div>

      <h2 className="text-sm font-semibold text-gray-200 mb-3">
        {plan.scenario}
      </h2>

      {/* Roles */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {plan.roles.map((role, i) => (
          <motion.div
            key={role.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex-shrink-0 min-w-[120px] bg-gray-800/60 rounded-lg p-2.5 border border-gray-800"
          >
            <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-0.5">
              {role.key}
            </div>
            <div className="text-[10px] text-gray-500 line-clamp-2">
              {role.description}
            </div>
            {role.model && (
              <div className="text-[9px] text-gray-700 mt-0.5 font-mono">{role.model}</div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Task flow */}
      <div className="mb-4">
        <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
          Task Flow
        </h3>
        <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
          {plan.tasks.map((task, i) => (
            <div key={task.id} className="flex items-center flex-shrink-0">
              <div className="bg-gray-800/80 border border-gray-800 rounded-md px-2.5 py-1.5 text-xs">
                <span className="text-gray-300">{task.title}</span>
                <div className="text-[9px] text-gray-600 mt-0.5">→ {task.assignedTo}</div>
              </div>
              {i < plan.tasks.length - 1 && (
                <ArrowRight className="w-2.5 h-2.5 text-gray-700 mx-0.5 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feasibility bars */}
      <div className="grid grid-cols-3 gap-3">
        <ProgressBar value={plan.feasibility.technical} label="Technical" color="bg-violet-500" />
        <ProgressBar value={plan.feasibility.scope} label="Scope" color="bg-violet-500" />
        <ProgressBar value={plan.feasibility.risk} label="Risk" color="bg-amber-500" />
      </div>

      {plan.feasibility.concerns.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {plan.feasibility.concerns.map((c, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
