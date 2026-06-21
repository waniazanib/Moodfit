import React, { useState } from "react";
import { Sparkles, ArrowLeft, Shirt, Cloud, Archive, Heart } from "lucide-react";

interface OutfitMatch {
  outfit_id: string;
  image_url: string;
  similarity_score: number;
  style_tags: string[];
  source: string; // "wardrobe" | "deepfashion"
}

interface ResultsGridProps {
  dominantEmotion: string;
  moodSummary: string;
  emotionBreakdown: Record<string, number>;
  results: OutfitMatch[];
  onReset: () => void;
  favoritedOutfitIds: string[];
  onToggleFavorite: (item: OutfitMatch) => void;
}

export default function ResultsGrid({
  dominantEmotion,
  moodSummary,
  emotionBreakdown,
  results,
  onReset,
  favoritedOutfitIds = [],
  onToggleFavorite,
}: ResultsGridProps) {
  const [filter, setFilter] = useState<"all" | "wardrobe" | "global">("all");

  const emotionColorMap: Record<string, { bg: string; text: string; hex: string }> = {
    melancholic: { bg: "bg-blue-950/40", text: "text-[#669bbc]", hex: "#336683" },
    joyful: { bg: "bg-amber-950/40", text: "text-[#eeb9a8]", hex: "#c1121f" },
    nostalgic: { bg: "bg-teal-950/40", text: "text-teal-400", hex: "#336683" },
    energetic: { bg: "bg-red-950/40", text: "text-[#c1121f]", hex: "#780000" },
    dark: { bg: "bg-purple-950/40", text: "text-[#9d0910]", hex: "#5c1d32" },
    romantic: { bg: "bg-rose-950/40", text: "text-[#df817aff]", hex: "#df817a" },
    calm: { bg: "bg-emerald-950/40", text: "text-emerald-400", hex: "#3f7a5c" },
  };

  const emotionStyles = emotionColorMap[dominantEmotion.toLowerCase()] || {
    bg: "bg-slate-900/40",
    text: "text-slate-200",
    hex: "#475569",
  };

  // Filter outfits
  const filteredResults = results.filter((item) => {
    if (filter === "wardrobe") return item.source === "wardrobe";
    if (filter === "global") return item.source === "deepfashion";
    return true;
  });

  return (
    <div id="results-grid-view" className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in">
      
      {/* Back Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition font-mono uppercase tracking-wider outline-none"
        >
          <ArrowLeft size={12} /> Analyze another verse
        </button>
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
          Aesthetic Alignment Match
        </span>
      </div>

      {/* Dominant Label Card */}
      <div className="p-6 rounded-2xl border border-white/5 bg-black/30 backdrop-blur relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">
            Extracted Dominant Tone:
          </span>
          <h2 className={`text-3xl md:text-4xl font-sans font-extrabold uppercase tracking-tight ${emotionStyles.text}`}>
            {dominantEmotion}
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl italic leading-relaxed">
            "{moodSummary}"
          </p>
        </div>
        <div className="shrink-0 relative h-12 w-12 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full blur-md animate-pulse"
            style={{ backgroundColor: emotionStyles.hex, opacity: 0.3 }}
          />
          <Sparkles className={emotionStyles.text} size={24} />
        </div>
      </div>

      {/* Probability Bars & Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Bars */}
        <div className="p-4 rounded-xl border border-white/5 bg-black/15 space-y-3">
          <h4 className="text-[10px] font-sans font-bold uppercase tracking-widest text-slate-400">
            Probability Distribution
          </h4>
          <div className="space-y-3 font-mono text-[10px]">
            {Object.entries(emotionBreakdown).map(([emotion, probability]) => {
              const probabilityPercent = Math.round(probability * 100);
              const isDominant = emotion.toLowerCase() === dominantEmotion.toLowerCase();
              return (
                <div key={emotion} className="space-y-1">
                  <div className="flex justify-between">
                    <span className={`capitalize ${isDominant ? "font-bold text-white" : "text-slate-400"}`}>
                      {emotion}
                    </span>
                    <span className="text-slate-500">{probabilityPercent}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${probabilityPercent}%`,
                        backgroundColor: isDominant ? emotionStyles.hex : "#1e293b",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="md:col-span-2 p-4 rounded-xl border border-white/5 bg-black/15 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-sans font-bold uppercase tracking-widest text-slate-400">
              Wardrobe Co-ordination Filters
            </h4>
            <p className="text-xs text-slate-400 leading-normal">
              Filter prediction records between your indexed personal wardrobe and DeepFashion datasets. Personal items get a prioritized score boost of <span className="text-teal-400 font-mono font-bold">+0.05</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition outline-none ${
                filter === "all"
                  ? "bg-[#669bbc]/10 border-[#669bbc] text-white"
                  : "border-[#336683]/20 bg-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Cloud size={12} /> Unified matches ({results.length})
            </button>
            <button
              onClick={() => setFilter("wardrobe")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition outline-none ${
                filter === "wardrobe"
                  ? "bg-teal-950/40 border-teal-500 text-teal-300"
                  : "border-[#336683]/20 bg-transparent text-slate-400 hover:text-teal-400"
              }`}
            >
              <Shirt size={12} /> My Closet ({results.filter((i) => i.source === "wardrobe").length})
            </button>
            <button
              onClick={() => setFilter("global")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition outline-none ${
                filter === "global"
                  ? "bg-[#003049] border-[#336683]/40 text-slate-300"
                  : "border-[#336683]/20 bg-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Archive size={12} /> Global ({results.filter((i) => i.source === "deepfashion").length})
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-sans font-bold uppercase tracking-widest text-slate-400">
          Aesthetically Aligned Outfits
        </h3>

        {filteredResults.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[#336683]/10 rounded-xl bg-black/10">
            <Shirt className="mx-auto text-slate-600 mb-1.5 animate-pulse" size={28} />
            <p className="text-xs text-slate-400 font-semibold">No matches found in this filter layer.</p>
            {filter === "wardrobe" && (
              <p className="text-[10px] text-slate-500 mt-1 max-w-xs mx-auto font-sans leading-relaxed">
                No personal attire matched closely. Upload your own garments in the Closet Upload screen to index them.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {filteredResults.map((item) => {
              const matchPercent = Math.round(item.similarity_score * 100);
              const isWardrobe = item.source === "wardrobe";
              const isFavorited = favoritedOutfitIds.includes(item.outfit_id);
              return (
                <div
                  key={item.outfit_id}
                  className="rounded-xl border border-white/5 bg-black/25 overflow-hidden group hover:border-camel/30 transition flex flex-col justify-between relative"
                >
                  <div className="aspect-[3/4] relative overflow-hidden bg-slate-950">
                    <img
                      src={item.image_url}
                      alt="Segmented outfit match"
                      className="object-cover h-full w-full group-hover:scale-105 transition duration-500"
                      referrerPolicy="no-referrer"
                    />

                    {/* Badge */}
                    <div className="absolute top-2 left-2 bg-black/85 border border-white/10 px-1.5 py-0.5 rounded-full text-[9px] font-mono text-white flex items-center gap-1">
                      <Sparkles size={8} className="text-camel" />
                      {matchPercent}%
                    </div>

                    {/* Save Favorite bookmark button */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFavorite(item);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 border border-white/10 hover:bg-black hover:border-camel/40 text-white transition cursor-pointer z-10"
                      title={isFavorited ? "Remove from Favorites" : "Save to Favorites"}
                    >
                      <Heart
                        size={11}
                        className={isFavorited ? "fill-red-500 text-red-500" : "text-white/70 hover:text-red-400"}
                      />
                    </button>

                    {/* Source label */}
                    <div className="absolute bottom-2 right-2">
                      {isWardrobe ? (
                        <span className="bg-[#1a1b14]/90 border border-tea-green text-tea-green text-[8px] font-mono px-1.5 py-0.5 rounded shadow">
                          Closet
                        </span>
                      ) : (
                        <span className="bg-[#1a1b14]/90 border border-camel text-camel text-[8px] font-mono px-1.5 py-0.5 rounded shadow">
                          DeepFashion
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-2 bg-black/10 flex-grow flex flex-col justify-end">
                    <div className="flex flex-wrap gap-1">
                      {item.style_tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[8px] font-mono bg-white/5 border border-white/5 px-1 py-0.5 rounded text-slate-400 capitalize"
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
