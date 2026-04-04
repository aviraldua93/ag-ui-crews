import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Clock, User } from "lucide-react";
import type { Artifact } from "@shared/types";

interface ArtifactViewerProps {
  artifacts: Artifact[];
}

export function ArtifactViewer({ artifacts }: ArtifactViewerProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (artifacts.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 p-6 shadow-lg shadow-black/20">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Artifacts
        </h2>
        <div className="text-center py-6 text-gray-600 text-sm">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No artifacts yet
        </div>
      </div>
    );
  }

  const current = artifacts[activeTab] ?? artifacts[0];

  return (
    <div className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 shadow-lg shadow-black/20 overflow-hidden">
      <div className="flex items-center border-b border-gray-800/50">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 flex-shrink-0">
          Artifacts
        </h2>
        <div className="flex overflow-x-auto">
          {artifacts.map((artifact, i) => (
            <motion.button
              key={`${artifact.taskId}-${artifact.filename}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                i === activeTab
                  ? "text-violet-400 border-violet-500"
                  : "text-gray-500 border-transparent hover:text-gray-300"
              }`}
            >
              <FileText className="w-3 h-3 inline mr-1.5" />
              {artifact.filename}
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="p-6"
        >
          <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {current.producedBy}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(current.producedAt).toLocaleTimeString()}
            </span>
            <span className="text-gray-600">Task: {current.taskId}</span>
          </div>
          <pre className="bg-gray-950 rounded-lg border border-gray-800/50 p-4 text-xs text-gray-300 font-mono overflow-auto max-h-64 whitespace-pre-wrap">
            {current.content}
          </pre>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
