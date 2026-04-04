import { useRef, useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Terminal, ArrowDownToLine, Filter } from "lucide-react";
import type { DashboardEvent, DashboardEventType } from "@shared/types";

interface EventLogProps {
  events: DashboardEvent[];
}

const typeColors: Record<string, string> = {
  CREW_PLAN_STARTED: "bg-violet-500/20 text-violet-400",
  CREW_PLAN_COMPLETED: "bg-emerald-500/20 text-emerald-400",
  CREW_PLAN_FAILED: "bg-rose-500/20 text-rose-400",
  WAVE_STARTED: "bg-sky-500/20 text-sky-400",
  WAVE_COMPLETED: "bg-emerald-500/20 text-emerald-400",
  WAVE_FAILED: "bg-rose-500/20 text-rose-400",
  AGENT_REGISTERED: "bg-violet-500/20 text-violet-400",
  AGENT_ACTIVE: "bg-sky-500/20 text-sky-400",
  AGENT_COMPLETED: "bg-emerald-500/20 text-emerald-400",
  AGENT_FAILED: "bg-rose-500/20 text-rose-400",
  AGENT_RETRYING: "bg-amber-500/20 text-amber-400",
  TASK_SUBMITTED: "bg-gray-500/20 text-gray-400",
  TASK_WORKING: "bg-sky-500/20 text-sky-400",
  TASK_COMPLETED: "bg-emerald-500/20 text-emerald-400",
  TASK_FAILED: "bg-rose-500/20 text-rose-400",
  TASK_RETRYING: "bg-amber-500/20 text-amber-400",
  ARTIFACT_PRODUCED: "bg-fuchsia-500/20 text-fuchsia-400",
  BRIDGE_CONNECTED: "bg-emerald-500/20 text-emerald-400",
  BRIDGE_DISCONNECTED: "bg-rose-500/20 text-rose-400",
  METRICS_UPDATE: "bg-gray-500/20 text-gray-400",
  STATE_SNAPSHOT: "bg-violet-500/20 text-violet-400",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

function summarize(event: DashboardEvent): string {
  const d = event.data;
  switch (event.type) {
    case "CREW_PLAN_STARTED":
      return "Planning crew…";
    case "CREW_PLAN_COMPLETED":
      return `Plan ready — ${d.roleCount ?? "?"} roles, ${d.taskCount ?? "?"} tasks`;
    case "CREW_PLAN_FAILED":
      return `Planning failed: ${d.error ?? "unknown"}`;
    case "WAVE_STARTED":
      return `Wave ${((d.waveIndex as number) ?? 0) + 1} started — ${d.taskCount ?? "?"} tasks`;
    case "WAVE_COMPLETED":
      return `Wave ${((d.waveIndex as number) ?? 0) + 1} completed`;
    case "WAVE_FAILED":
      return `Wave ${((d.waveIndex as number) ?? 0) + 1} failed`;
    case "AGENT_REGISTERED":
      return `Agent registered: ${d.name}`;
    case "AGENT_ACTIVE":
      return `${d.name} is now active`;
    case "AGENT_COMPLETED":
      return `${d.name} completed`;
    case "AGENT_FAILED":
      return `${d.name} failed`;
    case "AGENT_RETRYING":
      return `${d.name} retrying…`;
    case "TASK_SUBMITTED":
      return `Task submitted: ${d.title ?? d.taskId}`;
    case "TASK_WORKING":
      return `${d.assignedTo} working on: ${d.title ?? d.taskId}`;
    case "TASK_COMPLETED":
      return `${d.assignedTo} completed: ${d.title ?? d.taskId}`;
    case "TASK_FAILED":
      return `${d.assignedTo} failed: ${d.title ?? d.taskId}`;
    case "TASK_RETRYING":
      return `Retrying task: ${d.title ?? d.taskId}`;
    case "ARTIFACT_PRODUCED":
      return `Artifact: ${d.filename} by ${d.producedBy}`;
    case "BRIDGE_CONNECTED":
      return "Connected to bridge";
    case "BRIDGE_DISCONNECTED":
      return "Disconnected from bridge";
    case "METRICS_UPDATE":
      return "Metrics updated";
    case "STATE_SNAPSHOT":
      return "State snapshot received";
    default:
      return event.type;
  }
}

const allEventTypes: DashboardEventType[] = [
  "CREW_PLAN_STARTED", "CREW_PLAN_COMPLETED", "CREW_PLAN_FAILED",
  "WAVE_STARTED", "WAVE_COMPLETED", "WAVE_FAILED",
  "AGENT_REGISTERED", "AGENT_ACTIVE", "AGENT_COMPLETED", "AGENT_FAILED", "AGENT_RETRYING",
  "TASK_SUBMITTED", "TASK_WORKING", "TASK_COMPLETED", "TASK_FAILED", "TASK_RETRYING",
  "ARTIFACT_PRODUCED", "BRIDGE_CONNECTED", "BRIDGE_DISCONNECTED", "METRICS_UPDATE", "STATE_SNAPSHOT",
];

export function EventLog({ events }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState<DashboardEventType | "ALL">("ALL");

  const filtered = useMemo(
    () => (filterType === "ALL" ? events : events.filter((e) => e.type === filterType)),
    [events, filterType]
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  return (
    <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 shadow-lg shadow-black/20 flex flex-col max-h-[300px]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Event Log
          </h2>
          <span className="text-[10px] text-gray-600 font-mono">
            ({filtered.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`p-1.5 rounded-md transition-colors ${
                filterType !== "ALL"
                  ? "bg-violet-500/20 text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
            {showFilter && (
              <div className="absolute right-0 top-8 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto w-48">
                <button
                  onClick={() => { setFilterType("ALL"); setShowFilter(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${filterType === "ALL" ? "text-violet-400" : "text-gray-300"}`}
                >
                  All Events
                </button>
                {allEventTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setFilterType(t); setShowFilter(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${filterType === t ? "text-violet-400" : "text-gray-300"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-md transition-colors ${
              autoScroll
                ? "bg-violet-500/20 text-violet-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5 font-mono text-xs"
      >
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-gray-600">
            No events yet
          </div>
        ) : (
          filtered.map((event, i) => (
            <motion.div
              key={`${event.timestamp}-${event.type}-${i}`}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 py-0.5"
            >
              <span className="text-gray-600 flex-shrink-0 w-[70px]">
                {formatTimestamp(event.timestamp)}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                  typeColors[event.type] ?? "bg-gray-500/20 text-gray-400"
                }`}
              >
                {event.type.replace(/_/g, " ")}
              </span>
              <span className="text-gray-400 truncate">
                {summarize(event)}
              </span>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
