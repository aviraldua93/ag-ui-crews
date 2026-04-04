import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { User, Clock } from "lucide-react";
import type { Artifact } from "@shared/types";

interface ArtifactViewerProps {
  artifacts: Artifact[];
}

export function ArtifactViewer({ artifacts }: ArtifactViewerProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (artifacts.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Artifacts
        </h2>
        <div className="text-center py-6 text-gray-600 text-xs">
          No artifacts yet
        </div>
      </div>
    );
  }

  const current = artifacts[activeTab] ?? artifacts[0];

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-800 overflow-x-auto">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 flex-shrink-0">
          Artifacts
        </h2>
        {artifacts.map((artifact, i) => (
          <button
            key={`${artifact.taskId}-${artifact.filename}`}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
              i === activeTab
                ? "text-violet-400 border-violet-500"
                : "text-gray-600 border-transparent hover:text-gray-400"
            }`}
          >
            {artifact.filename}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="p-4"
        >
          <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {current.producedBy}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {new Date(current.producedAt).toLocaleTimeString()}
            </span>
            <span>Task: {current.taskId}</span>
          </div>
          <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 text-xs text-gray-400 font-mono overflow-auto max-h-56 whitespace-pre-wrap leading-relaxed">
            {current.content}
          </pre>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
