import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ArrowDownToLine, Search, X } from "lucide-react";
import type { DashboardEvent } from "@shared/types";

// ─── Event Category Taxonomy ───────────────────────────────────────────────────

export const EVENT_CATEGORIES = {
  PLAN:     { label: "Plan",     emoji: "📋", prefixes: ["CREW_PLAN_"] },
  WAVE:     { label: "Wave",     emoji: "🌊", prefixes: ["WAVE_"] },
  AGENT:    { label: "Agent",    emoji: "🤖", prefixes: ["AGENT_"] },
  TASK:     { label: "Task",     emoji: "⚙️",  prefixes: ["TASK_"] },
  ARTIFACT: { label: "Artifact", emoji: "📦", prefixes: ["ARTIFACT_"] },
  BRIDGE:   { label: "Bridge",   emoji: "🔗", prefixes: ["BRIDGE_"] },
} as const;

export type EventCategory = keyof typeof EVENT_CATEGORIES;

const CATEGORY_KEYS = Object.keys(EVENT_CATEGORIES) as EventCategory[];

/** Returns the category key for a DashboardEventType, or null if not categorized. */
export function getEventCategory(type: string): EventCategory | null {
  for (const [key, cat] of Object.entries(EVENT_CATEGORIES)) {
    if (cat.prefixes.some((p) => type.startsWith(p))) return key as EventCategory;
  }
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

export function summarize(event: DashboardEvent): string {
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

// ─── Pure Filtering Logic (testable) ───────────────────────────────────────────

/** Excludes internal-only events (METRICS_UPDATE, STATE_SNAPSHOT) from display. */
export function excludeInternalEvents(events: DashboardEvent[]): DashboardEvent[] {
  return events.filter((e) => e.type !== "METRICS_UPDATE" && e.type !== "STATE_SNAPSHOT");
}

/**
 * Filters events by active categories and/or text search query.
 * Pure function extracted for testability.
 *
 * - If no categories active AND no search query → returns all events unchanged
 * - Category filter: event must belong to one of the active categories
 * - Text search: case-insensitive match against summarize() output
 * - Both filters are combined with AND logic
 */
export function filterEvents(
  events: DashboardEvent[],
  activeCategories: Set<EventCategory>,
  searchQuery: string,
): DashboardEvent[] {
  const hasCategories = activeCategories.size > 0;
  const lowerSearch = searchQuery.toLowerCase();
  const hasSearch = lowerSearch.length > 0;

  if (!hasCategories && !hasSearch) return events;

  return events.filter((event) => {
    if (hasCategories) {
      const cat = getEventCategory(event.type);
      if (!cat || !activeCategories.has(cat)) return false;
    }
    if (hasSearch) {
      const summary = summarize(event).toLowerCase();
      if (!summary.includes(lowerSearch)) return false;
    }
    return true;
  });
}

// ─── EventLogFilter Sub-Component ──────────────────────────────────────────────

interface EventLogFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategories: Set<EventCategory>;
  onToggleCategory: (category: EventCategory) => void;
  onClearAll: () => void;
}

function EventLogFilter({
  searchQuery,
  onSearchChange,
  activeCategories,
  onToggleCategory,
  onClearAll,
}: EventLogFilterProps) {
  const activeCount = activeCategories.size + (searchQuery ? 1 : 0);

  return (
    <div
      role="toolbar"
      aria-label="Event filters"
      className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-800/50 flex-shrink-0"
    >
      {/* Search input */}
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
        <input
          type="search"
          data-testid="event-search-input"
          aria-label="Search events"
          placeholder="Search events…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-md text-[11px] text-gray-300 placeholder:text-gray-600 pl-7 pr-7 h-7 w-32 sm:w-44 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto">
        {CATEGORY_KEYS.map((key) => {
          const cat = EVENT_CATEGORIES[key];
          const isActive = activeCategories.has(key);
          return (
            <button
              key={key}
              role="checkbox"
              aria-checked={isActive}
              data-testid={`event-filter-chip-${key}`}
              onClick={() => onToggleCategory(key)}
              className={`
                px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider
                border transition-colors cursor-pointer select-none whitespace-nowrap
                ${isActive
                  ? "bg-violet-500/20 text-violet-400 border-violet-500/30 hover:bg-violet-500/25 hover:border-violet-500/40"
                  : "bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-800/80 hover:text-gray-400 hover:border-gray-600"
                }
              `}
            >
              {cat.emoji} {cat.label}
            </button>
          );
        })}

        {/* Clear all (visible when filters are active) */}
        {activeCount > 0 && (
          <button
            data-testid="event-filter-clear"
            onClick={onClearAll}
            aria-label="Clear all filters"
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer flex items-center gap-1 ml-auto flex-shrink-0 whitespace-nowrap"
          >
            Clear
            <span
              aria-live="polite"
              className="bg-violet-500/20 text-violet-400 text-[9px] font-mono w-4 h-4 rounded-full flex items-center justify-center"
            >
              {activeCount}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── EventLog Component ────────────────────────────────────────────────────────

export function EventLog({ events }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(new Set());

  // Debounced search: 150ms delay to avoid re-filtering every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleCategory = useCallback((category: EventCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setActiveCategories(new Set());
    setSearchQuery("");
    setDebouncedSearch("");
  }, []);

  // Pre-filter: exclude METRICS_UPDATE and STATE_SNAPSHOT (never shown)
  const baseFiltered = useMemo(
    () => events.filter((e) => e.type !== "METRICS_UPDATE" && e.type !== "STATE_SNAPSHOT"),
    [events]
  );

  // Apply user category + text search filters
  const filtered = useMemo(
    () => filterEvents(baseFiltered, activeCategories, debouncedSearch),
    [baseFiltered, activeCategories, debouncedSearch],
  );

  // Auto-scroll: trigger when filtered list changes and new events pass filters
  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [filtered, autoScroll]);

  // Determine if we have events but none match filters (for empty state message)
  const hasEventsButNoMatches = baseFiltered.length > 0 && filtered.length === 0;

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
        <EventLogFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategories={activeCategories}
          onToggleCategory={toggleCategory}
          onClearAll={clearAll}
        />
      )}
      {!collapsed && (
        <div ref={scrollRef} className="overflow-y-auto px-4 py-1.5 font-mono text-[11px] leading-5 max-h-[240px]">
          {filtered.length === 0 ? (
            <div className="text-center py-4 text-gray-700">
              {hasEventsButNoMatches ? "No matching events" : "No events yet"}
            </div>
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