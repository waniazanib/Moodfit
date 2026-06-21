/**
 * MoodFit — Main Retrieval Page (App Router)
 * next-frontend/app/page.tsx
 */

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Shirt, Loader2, Library, BookOpen } from "lucide-react";

import HistorySidebar from "../components/HistorySidebar";
import PredictForm from "../components/PredictForm";
import ResultsGrid from "../components/ResultsGrid";
import { moodFitApi } from "../utils/api";
import { MoodPredictInput } from "../utils/schemas";

const LOADING_STATUSES = [
  "Reading your words...",
  "Feeling the mood...",
  "Querying RoBERTa emotion labels...",
  "Formatting CLIP text embeddings...",
  "Searching the wardrobe...",
];

export default function Home() {
  const [history, setHistory] = useState<any[]>([]);
  const [activeSearch, setActiveSearch] = useState<any | null>(null);
  
  // Loading progression structures
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Poll loading statuses to keep user engaged during PyTorch runs
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setLoadingStatusIndex(0);
      interval = setInterval(() => {
        setLoadingStatusIndex((prev) => (prev < LOADING_STATUSES.length - 1 ? prev + 1 : prev));
      }, 1500);
    } else {
      setLoadingStatusIndex(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Sync archive on start
  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsSidebarLoading(true);
    try {
      const data = await moodFitApi.history();
      setHistory(data);
    } catch {
      // safe fallback
    } finally {
      setIsSidebarLoading(false);
    }
  };

  const handlePredictSubmit = async (data: MoodPredictInput) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await moodFitApi.predict(data);
      setActiveSearch(res);
      // Refresh history records safely
      fetchHistory();
    } catch (err: any) {
      setErrorMsg(err.message || "Evaluation error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistorySearch = (record: any) => {
    // Cast simple archive object into results formats
    setActiveSearch({
      search_id: record.id,
      dominant_emotion: record.dominant_emotion,
      mood_summary: record.mood_summary || `Evoking the depth of ${record.dominant_emotion}.`,
      emotion_breakdown: record.emotion_vector || { [record.dominant_emotion]: 1 },
      results: [], // Results would render on click; in full postgres we retrieve associated IDs
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#001424] text-white">
      
      {/* Search Archives Sidebar */}
      <HistorySidebar
        history={history}
        onSelectSearch={handleSelectHistorySearch}
        isLoading={isSidebarLoading}
      />

      {/* Main workspace container */}
      <div className="flex-1 overflow-y-auto flex flex-col justify-between">
        
        {/* Navigation Navbar */}
        <header className="h-16 border-b border-[#336683]/10 px-6 flex items-center justify-between shrink-0 bg-[#001424]/40 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#9d0910] to-[#c1121f] flex items-center justify-center font-display font-black text-white italic shadow shadow-red-900/30">
              M
            </div>
            <div>
              <h1 className="font-display font-bold text-sm tracking-widest text-[#fdf0d5] uppercase">
                MoodFit
              </h1>
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">
                Poetry-to-Outfit Aesthetic Alignment
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/wardrobe"
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-teal-500/30 bg-teal-950/20 text-teal-300 text-xs font-mono tracking-wider hover:bg-teal-950/50 transition uppercase"
            >
              <Shirt size={13} /> Closet upload Center
            </Link>
          </div>
        </header>

        {/* Core Workspace Sections */}
        <main className="flex-grow p-6 md:p-12 max-w-5xl mx-auto w-full flex flex-col justify-center">
          
          {isLoading ? (
            /* LOADING STATE - Animated Progression */
            <div className="text-center py-24 space-y-6 max-w-md mx-auto">
              <Loader2 className="animate-spin text-red-500 mx-auto" size={48} />
              <div className="space-y-2">
                <h4 className="text-sm font-mono tracking-widest text-slate-400 capitalize animate-pulse">
                  {LOADING_STATUSES[loadingStatusIndex]}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Aligning deep poetic descriptions with CLIP visual features and vector positions...
                </p>
              </div>
            </div>
          ) : activeSearch ? (
            /* RESULTS STATE */
            <ResultsGrid
              dominantEmotion={activeSearch.dominant_emotion}
              moodSummary={activeSearch.mood_summary}
              emotionBreakdown={activeSearch.emotion_breakdown}
              results={activeSearch.results}
              onReset={() => setActiveSearch(null)}
            />
          ) : (
            /* INPUT STATE */
            <div className="space-y-12 animate-fade-in py-8">
              <div className="text-center space-y-3 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[10px] font-mono text-[#df817a] uppercase tracking-widest">
                  <Sparkles size={10} /> Now Live: Vector Retrieval Mode
                </div>
                <h2 className="text-4xl md:text-5xl font-display font-light text-slate-100 tracking-tight leading-none">
                  Dress in the <span className="text-[#df817a] italic">Vibe</span> of Your Words
                </h2>
                <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Analyze literary verses, song lyrics, or complex prose using the custom RoBERTa classifiers. Matches your text's emotional landscape directly with unit-normalized retail garments in milliseconds.
                </p>
              </div>

              {errorMsg && (
                <div className="p-4 border border-red-950 bg-red-950/20 rounded-xl text-center text-xs text-[#df817a] font-mono max-w-xl mx-auto">
                  {errorMsg}
                </div>
              )}

              <PredictForm onSubmit={handlePredictSubmit} isLoading={isLoading} />
            </div>
          )}
        </main>

        {/* Footer info declarations */}
        <footer className="h-12 border-t border-[#336683]/5 px-6 flex items-center justify-between shrink-0 text-[10px] text-slate-500 font-mono">
          <span>&copy; {new Date().getFullYear()} MOODFIT RETRIEVAL INC.</span>
          <div className="flex gap-4">
            <span className="hover:text-slate-300 transition">DOCS</span>
            <span className="hover:text-slate-300 transition">FAISS INDEX</span>
            <span className="hover:text-slate-300 transition">ARTEMIS DATASET</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
