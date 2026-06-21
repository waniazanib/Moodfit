import React, { useState } from "react";
import { History, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface SearchRecord {
  id: string;
  input_text: string;
  dominant_emotion: string;
  created_at: string;
}

interface HistorySidebarProps {
  history: SearchRecord[];
  onSelectSearch: (record: SearchRecord) => void;
  isLoading: boolean;
}

export default function HistorySidebar({
  history,
  onSelectSearch,
  isLoading,
}: HistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Mapped emotion tags colors
  const emotionColorMap: Record<string, string> = {
    melancholic: "bg-blue-900/30 text-blue-300 border-blue-800",
    joyful: "bg-amber-900/30 text-amber-300 border-amber-800",
    nostalgic: "bg-teal-900/30 text-teal-300 border-teal-800",
    energetic: "bg-red-900/30 text-red-300 border-red-800",
    dark: "bg-purple-900/30 text-purple-300 border-purple-800",
    romantic: "bg-rose-900/30 text-rose-300 border-rose-800",
    calm: "bg-emerald-900/30 text-emerald-300 border-emerald-800",
  };

  return (
    <div
      as-id="history-sidebar"
      id="history-sidebar"
      className={`relative h-full border-r border-[#336683]/20 bg-[#001424]/90 backdrop-blur-md transition-all duration-300 ${
        isOpen ? "w-72" : "w-16"
      } flex flex-col shrink-0 z-10`}
    >
      {/* Collapse Trigger Toggle */}
      <button
        id="sidebar-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-camel/30 bg-app-card text-app-text hover:text-camel transition"
        aria-label="Collapse sidebar toggle"
      >
        {isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* Header */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-[#336683]/10">
        <History className="text-[#669bbc] shrink-0" size={18} />
        {isOpen && (
          <span className="font-sans font-semibold text-xs text-gray-200 uppercase tracking-widest">
            Search Archives
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isOpen ? (
          <>
            {isLoading ? (
              <div className="text-center py-8 text-xs text-slate-500 font-mono">
                syncing archives...
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-camel/10 rounded-lg bg-black/10">
                <p className="text-xs text-app-text/60">History is empty.</p>
                <p className="text-[10px] text-app-text/40 mt-1 font-mono">Paste some poetry to start</p>
              </div>
            ) : (
              history.map((record) => {
                const badgeStyle =
                  emotionColorMap[record.dominant_emotion.toLowerCase()] ||
                  "bg-slate-900 text-slate-400 border-slate-800";
                return (
                  <button
                    key={record.id}
                    id={`history-item-${record.id}`}
                    onClick={() => onSelectSearch(record)}
                    className="w-full text-left p-3 rounded-lg border border-transparent bg-[#003049]/40 hover:bg-[#003049]/75 hover:border-[#669bbc]/20 transition group"
                  >
                    <p className="text-xs text-slate-300 line-clamp-2 italic font-sans mb-1.5 group-hover:text-white">
                      "{record.input_text}"
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${badgeStyle} capitalize`}
                      >
                        {record.dominant_emotion}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {new Date(record.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </>
        ) : (
          /* Mini view when collapsed */
          <div className="flex flex-col items-center gap-4 py-4">
            {history.slice(0, 8).map((record) => (
              <button
                key={record.id}
                id={`collapsed-history-${record.id}`}
                onClick={() => setIsOpen(true)}
                className="h-8 w-8 rounded-full border border-[#336683]/10 bg-[#003049]/50 flex items-center justify-center text-xs hover:bg-[#669bbc]/20 transition relative group"
                title={record.input_text}
              >
                <Sparkles size={11} className="text-[#df817aff]" />
                <div className="absolute left-10 scale-0 group-hover:scale-100 transition origin-left bg-black/95 text-white py-1 px-2 rounded text-[9px] whitespace-nowrap z-50 pointer-events-none">
                  {record.dominant_emotion}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
