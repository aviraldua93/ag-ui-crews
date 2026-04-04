import { useRef, useEffect, useState, useMemo } from "react";
import { ArrowDownToLine } from "lucide-react";
import type { DashboardEvent } from "@shared/types";

interface EventLogProps {
  events: DashboardEvent[];
}

function dotColor(type: string): string {
  if (type.includes("COMPLETED") || type === "BRIDGE_CONNECTED") return "bg-emerald-500";
  if (type.includes("FAILED") || type === "BRIDGE_DISCONNECTED") return "bg-rose-500";
  if (type.includes("RETRYING")) return "bg-amber-500";
  if (type.includes("WORKING") || type.includes("ACTIVE") || type.includes("STARTED")) return "bg-violet-500";
  return "bg-gray-600";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

function summarize(event: DashboardEvent): string {
  const d = event.data;
  switch (event.type) {
    case "CREW_PLAN_STARTED": return "Planning crew\u2026";
    case "CREW_PLAN_COMPLETED": return `Plan ready \u2014 ${d.roleCount ?? "?"} roles, ${d.taskCount ?? "?"} tasks`;
    case "CREW_PLAN_FAILED": return `Planning failed: ${d.error ?? "unknown"}`;
    case "WAVE_STARTED": return `Wave ${((d.waveIndex as number) ?? 0) + 1} started \u2014 ${d.taskCount ?? "?"} tasks`;
    case "WAVE_COMPLETED": return `Wave ${((d.waveIndex as number) ?? 0) + 1} completed`;
    case "WAVE_FAILED": return `Wave ${((d.waveIndex as number) ?? 0) + 1} failed`;
    case "AGENT_REGISTERED": return `Agent registered: ${d.name}`;
    case "AGENT_ACTIVE": return `${d.name} active`;
    case "AGENT_COMPLETED": return `${d.name} completed`;
    case "AGENT_FAILED": return `${d.name} failed`;
    case "AGENT_RETRYING": return `${d.name} retrying\u2026`;
    case "TASK_SUBMITTED": return `Task submitted: ${d.title ?? d.taskId}`;
    case "TASK_WORKING": return `${d.assignedTo} working: ${d.title ?? d.taskId}`;
    case "TASK_COMPLETED": return `${d.assignedTo} completed: ${d.title ?? d.taskId}`;
    case "TASK_FAILED": return `${d.assignedTo} failed: ${d.title ?? d.taskId}`;
    case "TASK_RETRYING": return `Retrying: ${d.title ?? d.taskId}`;
    case "ARTIFACT_PRODUCED": return `Artifact: ${d.filename} by ${d.producedBy}`;
    case "BRIDGE_CONNECTED": return "Connected to bridge";
    case "BRIDGE_DISCONNECTED": return "Disconnected";
    case "METRICS_UPDATE": return "Metrics updated";
    case "STATE_SNAPSHOT": return "State snapshot";
    default: return event.type;
  }
}

export function EventLog({ events }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const filtered = useMemo(
    () => events.filter((e) => e.type !== "METRICS_UPDATE" && e.type !== "STATE_SNAPSHOT"),
    [events]
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [filtered, autoScroll]);

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2">
          <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Console</h2>
          <span className="text-[10px] text-gray-700 font-mono">{filtered.length}</span>
          <span className="text-[10px] text-gray-700">{collapsed ? "\u25BC" : "\u25B2"}</span>
        </button>
        {!collapsed && (
          <button onClick={() => setAutoScroll(!autoScroll)} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${autoScroll ? "text-violet-400" : "text-gray-600 hover:text-gray-400"}`}>
            <ArrowDownToLine className="w-3 h-3" />
          </button>
        )}
      </div>
      {!collapsed && (
        <div ref={scrollRef} className="overflow-y-auto px-4 py-1.5 font-mono text-[11px] leading-5 max-h-[240px]">
          {filtered.length === 0 ? (
            <div className="text-center py-4 text-gray-700">No events yet</div>
          ) : filtered.map((event, i) => (
            <div key={`${event.timestamp}-${event.type}-${i}`} className="flex items-center gap-2">
              <span className="text-gray-700 flex-shrink-0 w-[62px]">{formatTimestamp(event.timestamp)}</span>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor(event.type)}`} />
              <span className="text-gray-500 truncate">{summarize(event)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}