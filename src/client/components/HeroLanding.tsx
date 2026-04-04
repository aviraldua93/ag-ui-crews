import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wifi, Play, ArrowRight, X, Search, Radio, Users, ListChecks, Loader2 } from "lucide-react";

interface DiscoveredBridge {
  url: string;
  port: number;
  agents: number;
  tasks: { total: number; completed: number; working: number };
  uptime: number;
}

interface HeroLandingProps {
  onConnect: (url: string) => void;
  onSimulate: () => void;
}

export function HeroLanding({ onConnect, onSimulate }: HeroLandingProps) {
  const [showConnect, setShowConnect] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://localhost:");
  const [bridges, setBridges] = useState<DiscoveredBridge[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const scanForBridges = async () => {
    setScanning(true);
    try {
      const resp = await fetch("/api/discover");
      if (resp.ok) {
        const data = await resp.json();
        setBridges(data.bridges ?? []);
      }
    } catch {
      // Discovery not available
    }
    setScanning(false);
    setScanned(true);
  };

  useEffect(() => {
    if (showConnect && !scanned) {
      scanForBridges();
    }
  }, [showConnect, scanned]);

  const handleConnect = () => {
    if (bridgeUrl.trim()) {
      onConnect(bridgeUrl.trim());
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-violet-100/60 via-gray-50 to-gray-50 dark:from-violet-950/40 dark:via-gray-950 dark:to-gray-950" />
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-violet-500/20 dark:bg-violet-400/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.1, 0.5, 0.1],
            }}
            transition={{
              duration: 3 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: "easeInOut",
            }}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 text-center max-w-2xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center mb-8 shadow-2xl shadow-violet-500/30"
        >
          <Sparkles className="w-10 h-10 text-white" />
        </motion.div>

        <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
          ag-ui-crews
        </h1>
        <p className="text-xl text-gray-500 dark:text-gray-400 mb-2">
          Mission Control for Your AI Crews
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-10 max-w-md mx-auto">
          Watch your AI agent crews plan, execute, and deliver in real-time.
          Connect to a live a2a-crews bridge or run a simulation.
        </p>

        <AnimatePresence mode="wait">
          {showConnect ? (
            <motion.div
              key="connect-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-4"
            >
              {scanning && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning for active crews...
                </div>
              )}

              {!scanning && bridges.length > 0 && (
                <div className="w-full max-w-lg">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    Found {bridges.length} active crew{bridges.length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-2">
                    {bridges.map((b) => (
                      <motion.button
                        key={b.port}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onConnect(b.url)}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-300 dark:border-gray-700 hover:border-violet-500/50 text-left transition-all group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                          <Radio className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                            localhost:{b.port}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b.agents} agent{b.agents !== 1 ? "s" : ""}</span>
                            <span className="flex items-center gap-1"><ListChecks className="w-3 h-3" />{b.tasks.completed}/{b.tasks.total} tasks</span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-violet-400 transition-colors" />
                      </motion.button>
                    ))}
                  </div>
                  <button onClick={scanForBridges} className="mt-2 text-xs text-gray-500 hover:text-violet-400 transition-colors">↻ Rescan</button>
                </div>
              )}

              {!scanning && scanned && bridges.length === 0 && (
                <div className="text-sm text-gray-500 bg-white/50 dark:bg-gray-900/50 rounded-xl px-4 py-3 border border-gray-300 dark:border-gray-800">
                  No active crews found. Run <code className="text-violet-400 text-xs">crews launch</code> first, or enter a URL:
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bridgeUrl}
                  onChange={(e) => setBridgeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                    if (e.key === "Escape") setShowConnect(false);
                  }}
                  placeholder="http://localhost:62647"
                  autoFocus={bridges.length === 0}
                  className="w-72 px-4 py-3 rounded-xl text-sm bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono"
                />
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={handleConnect}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-lg shadow-violet-500/20">
                  <ArrowRight className="w-4 h-4" />Go
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => setShowConnect(false)}
                  className="p-3 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                Just exploring? Try <button onClick={onSimulate} className="text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2">Run Simulation</button> instead
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="buttons"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-4"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowConnect(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-violet-500/50 hover:text-gray-900 dark:hover:text-white transition-all shadow-lg shadow-black/5 dark:shadow-black/20"
              >
                <Wifi className="w-4 h-4" />
                Connect to Bridge
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={onSimulate}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 transition-all shadow-lg shadow-violet-500/20"
              >
                <Play className="w-4 h-4" />
                Run Simulation
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
