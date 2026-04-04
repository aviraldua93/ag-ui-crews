import { useRef, useEffect, useState, useMemo } from "react";
import { ArrowDownToLine, Filter } from "lucide-react";
import type { DashboardEvent, DashboardEventType } from "@shared/types";

interface EventLogProps {
  events: DashboardEvent[];
}

const typeColor: Record<string, string> = {
  CREW_PLAN_STARTED: "text-violet-400",
  CREW_PLAN_COMPLETED: "text-emerald-400",
  CREW_PLAN_FAILED: "text-rose-400",
  WAVE_STARTED: "text-violet-400",
  WAVE_COMPLETED: "text-emerald-400",
  WAVE_FAILED: "text-rose-400",
  AGENT_REGISTERED: "text-gray-400",
  AGENT_ACTIVE: "text-violet-400",
  AGENT_COMPLETED: "text-emerald-400",
  AGENT_FAILED: "text-rose-400",
  AGENT_RETRYING: "text-amber-400",
  TASK_SUBMITTED: "text-gray-500",
  TASK_WORKING: "text-violet-400",
  TASK_COMPLETED: "text-emerald-400",
  TASK_FAILED: "text-rose-400",
  TASK_RETRYING: "text-amber-400",
  ARTIFACT_PRODUCED: "text-violet-400",
  BRIDGE_CONNECTED: "text-emerald-400",
  BRIDGE_DISCONNECTED: "text-rose-400",
  METRICS_UPDATE: "text-gray-600",
  STATE_SNAPSHOT: "text-gray-600",
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
    <div className="rounded-xl bg-gray-900 border border-gray-800 flex flex-col max-h-[280px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Console
          </h2>
          <span className="text-[10px] text-gray-700 font-mono">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                filterType !== "ALL" ? "text-violet-400" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <Filter className="w-3 h-3" />
            </button>
            {showFilter && (
              <div className="absolute right-0 top-7 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto w-44">
                <button
                  onClick={() => { setFilterType("ALL"); setShowFilter(false); }}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-700 ${filterType === "ALL" ? "text-violet-400" : "text-gray-400"}`}
                >
                  All
                </button>
                {allEventTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setFilterType(t); setShowFilter(false); }}
                    className={`w-full text-left px-3 py-1 text-xs font-mono hover:bg-gray-700 ${filterType === t ? "text-violet-400" : "text-gray-500"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              autoScroll ? "text-violet-400" : "text-gray-600 hover:text-gray-400"
            }`}
          >
            <ArrowDownToLine className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-1.5 font-mono text-[11px] leading-5"
      >
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-gray-700">
            No events yet
          </div>
        ) : (
          filtered.map((event, i) => (
            <div
              key={`${event.timestamp}-${event.type}-${i}`}
              className="flex items-baseline gap-2"
            >
              <span className="text-gray-700 flex-shrink-0 w-[62px]">
                {formatTimestamp(event.timestamp)}
              </span>
              <span className={`flex-shrink-0 ${typeColor[event.type] ?? "text-gray-600"}`}>
                {event.type}
              </span>
              <span className="text-gray-500 truncate">
                {summarize(event)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
