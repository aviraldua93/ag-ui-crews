import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Users, RefreshCw, ChevronRight } from "lucide-react";

interface DiscoveredBridge {
  url: string;
  port: number;
  agents: number;
  tasks: { total: number; completed: number; working: number };
  uptime: number;
  team: string;
  scenario: string;
}

interface HeroLandingProps {
  onConnect: (url: string) => void;
  onSimulate: () => void;
}

export function HeroLanding({ onConnect }: HeroLandingProps) {
  const [bridges, setBridges] = useState<DiscoveredBridge[]>([]);
  const [scanning, setScanning] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = useCallback(async (silent = false) => {
    if (!silent) setScanning(true);
    try {
      const resp = await fetch("/api/discover");
      if (resp.ok) {
        const data = await resp.json();
        setBridges(data.bridges ?? []);
      }
    } catch { /* noop */ }
    setScanning(false);
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    scan();
    intervalRef.current = setInterval(() => scan(true), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [scan]);

  const taskProgress = (b: DiscoveredBridge) => {
    if (b.tasks.total === 0) return 0;
    return Math.round((b.tasks.completed / b.tasks.total) * 100);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-lg"
      >
        {/* Wordmark */}
        <div className="text-center mb-10">
          <h1 className="text-sm font-semibold text-gray-500 tracking-wide">
            ag-ui-crews
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {initialLoad ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-16"
            >
              <div className="w-5 h-5 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
            </motion.div>
          ) : bridges.length > 0 ? (
            <motion.div
              key="crews"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {bridges.length} crew{bridges.length !== 1 ? "s" : ""} running
                </p>
                <button
                  onClick={() => scan()}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              <div className="space-y-2">
                {bridges.map((b, i) => (
                  <motion.button
                    key={b.port}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    onClick={() => onConnect(b.url)}
                    className="w-full group rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 p-4 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-100 truncate">
                            {b.scenario || b.team}
                          </span>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            b.tasks.completed === b.tasks.total && b.tasks.total > 0
                              ? "bg-emerald-500"
                              : "bg-violet-500 animate-pulse"
                          }`} />
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {b.agents}
                          </span>
                          <span className="font-mono">
                            {b.tasks.completed}/{b.tasks.total} tasks
                          </span>
                        </div>

                        <div className="mt-2.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${
                              taskProgress(b) === 100 ? "bg-emerald-500" : "bg-violet-500"
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${taskProgress(b)}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <Sparkles className="w-6 h-6 text-gray-600 mb-4" />

              <p className="text-sm text-gray-300 mb-1">
                Waiting for crews…
              </p>
              <p className="text-xs text-gray-600 mb-6">
                Scanning automatically
              </p>

              <div className="w-full rounded-xl bg-gray-900 border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-2">
                  Launch a crew from your terminal:
                </p>
                <pre className="text-xs font-mono text-gray-400 leading-relaxed select-all">{`crews plan "Build something awesome"
crews apply
crews launch`}</pre>
              </div>

              <button
                onClick={() => scan()}
                className="mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
                Scan again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
