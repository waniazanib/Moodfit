/**
 * MoodFit — Multi-source retrieval results display component
 * next-frontend/components/ResultsGrid.tsx
 */

"use client";

import React, { useState } from "react";
import { Sparkles, ArrowLeft, Shirt, Cloud, Archive } from "lucide-react";

interface OutfitMatch {
  outfit_id: string;
  image_url: string;
  similarity_score: float;
  style_tags: string[];
  source: string; // "wardrobe" | "deepfashion"
}

interface ResultsGridProps {
  dominantEmotion: string;
  moodSummary: string;
  emotionBreakdown: Record<string, number>;
  results: OutfitMatch[];
  onReset: () => void;
}

export default function ResultsGrid({
  dominantEmotion,
  moodSummary,
  emotionBreakdown,
  results,
  onReset,
}: ResultsGridProps) {
  const [filter, setFilter] = useState<"all" | "wardrobe" | "global">("all");

  // Map emotion labels to hex codes
  const emotionColorMap: Record<string, { bg: string; text: string; hex: string }> = {
    melancholic: { bg: "bg-blue-990/40", text: "text-[#669bbc]", hex: "#336683" },
    joyful: { bg: "bg-amber-950/40", text: "text-[#fdf0d5]", hex: "#eeb9a8" },
    nostalgic: { bg: "bg-teal-950/40", text: "text-teal-400", hex: "#336683" },
    energetic: { bg: "bg-red-950/40", text: "text-[#c1121f]", hex: "#780000" },
    dark: { bg: "bg-purple-950/40", text: "text-[#9d0910]", hex: "#5c1d32" },
    romantic: { bg: "bg-rose-950/40", text: "text-[#df817aff]", hex: "#df817a" },
    calm: { bg: "bg-emerald-950/40", text: "text-emerald-400", hex: "#3f7a5c" },
  };

  const emotionStyles = emotionColorMap[dominantEmotion.toLowerCase()] || {
    bg: "bg-slate-900",
    text: "text-slate-300",
    hex: "#475569",
  };

  // Filter outfits based on user selection
  const filteredResults = results.filter((item) => {
    if (filter === "wardrobe") return item.source === "wardrobe";
    if (filter === "global") return item.source === "deepfashion";
    return true;
  });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in">
      
      {/* Header Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition font-mono uppercase tracking-wider"
        >
          <ArrowLeft size={14} /> Analyze another poem
        </button>
        <span className="text-xs text-slate-500 font-mono">
          MODEL: RoBERTa-base + CLIP + FAISS
        </span>
      </div>

      {/* Dominant Emotion Header */}
      <div className={`p-6 md:p-8 rounded-2xl border border-white/5 bg-black/30 backdrop-blur relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6`}>
        <div className="space-y-2">
          <span className="text-xs text-slate-500 font-mono uppercase tracking-widest block">
            Extracted Dominant Vibe:
          </span>
          <h2 className={`text-4xl md:text-5xl font-display font-bold uppercase tracking-tight ${emotionStyles.text}`}>
            {dominantEmotion}
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl italic leading-relaxed">
            "{moodSummary}"
          </p>
        </div>
        <div className="shrink-0 flex items-center justify-center">
          <div
            className="h-16 w-16 md:h-20 md:w-20 rounded-full flex items-center justify-center blur-sm animate-pulse"
            style={{ backgroundColor: emotionStyles.hex, opacity: 0.15 }}
          />
          <Sparkles
            size={40}
            className={`absolute ${emotionStyles.text}`}
          />
        </div>
      </div>

      {/* Grid: Emotion Breakdown (Horizontal Bars) & Source Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Emotion Breakdown Panel */}
        <div className="md:col-span-1 p-5 rounded-2xl border border-white/5 bg-black/20 space-y-4">
          <h4 className="text-xs font-display uppercase tracking-wider text-slate-400">
            Probability Distribution
          </h4>
          <div className="space-y-3 font-mono text-xs">
            {Object.entries(emotionBreakdown).map(([emotion, probability]) => {
              const probabilityPercent = Math.round(probability * 100);
              const isDominant = emotion.toLowerCase() === dominantEmotion.toLowerCase();
              return (
                <div key={emotion} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className={`capitalize ${isDominant ? "font-bold text-white" : "text-slate-400"}`}>
                      {emotion}
                    </span>
                    <span className="text-slate-500">{probabilityPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${probabilityPercent}%`,
                        backgroundColor: isDominant
                          ? emotionStyles.hex
                          : "#1e293b",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters Controls */}
        <div className="md:col-span-2 p-5 rounded-2xl border border-white/5 bg-black/20 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <h4 className="text-xs font-display uppercase tracking-wider text-slate-400">
              Wardrobe Co-ordination Filters
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dynamically filter styling results between your personal indexed wardrobe and global DeepFashion catalogs. Personal garments are prioritized with a <span className="text-teal-400 font-mono font-bold">+0.05</span> score boost.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => setFilter("all")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono border transition ${
                filter === "all"
                  ? "bg-[#669bbc]/10 border-[#669bbc] text-white"
                  : "border-[#336683]/20 bg-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Cloud size={14} /> Unified matches ({results.length})
            </button>
            <button
              onClick={() => setFilter("wardrobe")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono border transition ${
                filter === "wardrobe"
                  ? "bg-teal-950/40 border-teal-500 text-teal-300"
                  : "border-[#336683]/20 bg-transparent text-slate-400 hover:text-teal-400"
              }`}
            >
              <Shirt size={14} /> My Closet only ({results.filter((i) => i.source === "wardrobe").length})
            </button>
            <button
              onClick={() => setFilter("global")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono border transition ${
                filter === "global"
                  ? "bg-[#003049] border-[#336683]/40 text-slate-300"
                  : "border-[#336683]/20 bg-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Archive size={14} /> Global Database ({results.filter((i) => i.source === "deepfashion").length})
            </button>
          </div>
        </div>
      </div>

      {/* Outfits Masonry Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-display uppercase tracking-widest text-slate-400">
          Top Matching Outfits & Garments
        </h3>

        {filteredResults.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#336683]/10 rounded-2xl bg-black/10">
            <Shirt className="mx-auto text-slate-600 mb-2" size={32} />
            <p className="text-sm text-slate-400 font-semibold">No matches found in this layer.</p>
            {filter === "wardrobe" && (
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No personal apparel matched this mood closely. Switch to "Unified matches" or visit the Closet Upload Center at `/wardrobe` to index your attire.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {filteredResults.map((item, idx) => {
              const matchPercent = Math.round(item.similarity_score * 100);
              const isWardrobe = item.source === "wardrobe";
              return (
                <div
                  key={item.outfit_id}
                  className="rounded-xl border border-white/5 bg-black/20 overflow-hidden relative group hover:border-[#669bbc]/30 transition flex flex-col justify-between"
                >
                  <div className="aspect-[3/4] relative overflow-hidden bg-slate-950">
                    <img
                      src={item.image_url}
                      alt="Aesthetic outfit proposal"
                      className="object-cover h-full w-full group-hover:scale-105 transition duration-500"
                    />

                    {/* Similarity score badge */}
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full text-[10px] font-mono text-white flex items-center gap-1">
                      <Sparkles size={8} className="text-red-400" />
                      {matchPercent}%
                    </div>

                    {/* Source badge */}
                    <div className="absolute bottom-2 right-2">
                      {isWardrobe ? (
                        <div className="bg-teal-900/95 border border-teal-500 text-teal-200 text-[9px] font-mono px-1.5 py-0.5 rounded shadow-lg uppercase">
                          Closet
                        </div>
                      ) : (
                        <div className="bg-[#003049]/90 border border-slate-700 text-slate-300 text-[9px] font-mono px-1.5 py-0.5 rounded shadow-lg uppercase">
                          DeepFashion
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata style tags */}
                  <div className="p-3 bg-black/10 flex-grow flex flex-col justify-end space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {item.style_tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] font-mono bg-white/5 border border-white/5 px-2 py-0.5 rounded text-slate-400 capitalize"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
