import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wifi, Play, ArrowRight, X } from "lucide-react";

interface HeroLandingProps {
  onConnect: (url: string) => void;
  onSimulate: () => void;
}

export function HeroLanding({ onConnect, onSimulate }: HeroLandingProps) {
  const [showConnect, setShowConnect] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://localhost:");

  const handleConnect = () => {
    if (bridgeUrl.trim()) {
      onConnect(bridgeUrl.trim());
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-violet-950/40 via-gray-950 to-gray-950" />
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-violet-400/20"
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
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 text-center max-w-lg"
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
        <p className="text-xl text-gray-400 mb-2">
          Mission Control for Your AI Crews
        </p>
        <p className="text-sm text-gray-500 mb-10 max-w-md mx-auto">
          Watch your AI agent crews plan, execute, and deliver in real-time.
          Connect to a live a2a-crews bridge or run a simulation.
        </p>

        <AnimatePresence mode="wait">
          {showConnect ? (
            <motion.div
              key="connect-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-3"
            >
              <p className="text-xs text-gray-400 mb-1">
                Enter the a2a-crews bridge URL (shown when you run <code className="text-violet-400">crews launch</code>)
              </p>
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
                  autoFocus
                  className="w-72 px-4 py-3 rounded-xl text-sm bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConnect}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-lg shadow-violet-500/20"
                >
                  <ArrowRight className="w-4 h-4" />
                  Go
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowConnect(false)}
                  className="p-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Don't have a2a-crews running? Try <button onClick={onSimulate} className="text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2">Run Simulation</button> instead
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
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-gray-200 hover:border-violet-500/50 hover:text-white transition-all shadow-lg shadow-black/20"
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
