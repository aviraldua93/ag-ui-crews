import { useState } from "react";
import type { Artifact } from "@shared/types";

interface ArtifactViewerProps {
  artifacts: Artifact[];
}

export function ArtifactViewer({ artifacts }: ArtifactViewerProps) {
  const [activeTab, setActiveTab] = useState(0);
  if (artifacts.length === 0) return null;
  const current = artifacts[activeTab] ?? artifacts[0];

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="flex items-center border-b border-gray-800 overflow-x-auto">
        <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 flex-shrink-0">Artifacts</h2>
        {artifacts.map((artifact, i) => (
          <button key={`${artifact.taskId}-${artifact.filename}`} onClick={() => setActiveTab(i)} className={`px-3 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-colors ${i === activeTab ? "text-violet-400 border-violet-500" : "text-gray-600 border-transparent hover:text-gray-400"}`}>
            {artifact.filename}
          </button>
        ))}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-600 font-mono">
          <span>{current.producedBy}</span>
          <span>{new Date(current.producedAt).toLocaleTimeString()}</span>
        </div>
        <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 text-xs text-gray-400 font-mono overflow-auto max-h-56 whitespace-pre-wrap leading-relaxed">{current.content}</pre>
      </div>
    </div>
  );
}