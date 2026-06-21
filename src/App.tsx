import React, { useState, useEffect } from "react";
import { Sparkles, Shirt, Loader2, ArrowLeft, Upload, Trash2, Shield, AlertTriangle, CheckCircle, BarChart3, HelpCircle, LogIn, LogOut, User, X, Heart } from "lucide-react";
import HistorySidebar from "./components/HistorySidebar";
import PredictForm from "./components/PredictForm";
import ResultsGrid from "./components/ResultsGrid";
import AuthPortal from "./components/AuthPortal";
import WelcomeEntrance from "./components/WelcomeEntrance";

const LOADING_STATUSES = [
  "Reading your words...",
  "Feeling the mood...",
  "Querying RoBERTa emotion labels...",
  "Formatting CLIP text embeddings...",
  "Searching the wardrobe...",
];

export default function App() {
  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem("moodfit-theme") || "classic";
  });

  useEffect(() => {
    localStorage.setItem("moodfit-theme", theme);
    if (theme === "classic") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const [activeTab, setActiveTab] = useState<"predict" | "closet">("predict");
  const [history, setHistory] = useState<any[]>([]);
  const [activeSearch, setActiveSearch] = useState<any | null>(null);

  // Favorites states
  const [favorites, setFavorites] = useState<any[]>([]);
  const [closetTab, setClosetTab] = useState<"wardrobe" | "favorites">("wardrobe");

  // Auth & Multi-user states
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [guestSession, setGuestSession] = useState<boolean>(() => sessionStorage.getItem("moodfit_guest_session") === "true");

  const handleContinueAsGuest = () => {
    sessionStorage.setItem("moodfit_guest_session", "true");
    setGuestSession(true);
    fetchHistory();
    fetchCloset();
    fetchFavorites();
  };

  // Loading Progression states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Closet/Wardrobe states
  const [closetItems, setClosetItems] = useState<any[]>([]);
  const [closetStats, setClosetStats] = useState<any>({ total_items: 0, categories: {} });
  const [isClosetLoading, setIsClosetLoading] = useState(false);

  // Upload file states
  const [dragActive, setDragActive] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "polling" | "ready" | "failed">("idle");
  const [itemsExtracted, setItemsExtracted] = useState(0);

  // Simulate status progression text timer
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setLoadingStatusIndex(0);
      interval = setInterval(() => {
        setLoadingStatusIndex((prev) => (prev < LOADING_STATUSES.length - 1 ? prev + 1 : prev));
      }, 1400);
    } else {
      setLoadingStatusIndex(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Auth helper wrapper to inject active room credentials
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const userId = localStorage.getItem("moodfit_user_id") || "guest-user-session-id-123";
    const headers = {
      ...(options.headers || {}),
      "Authorization": `Bearer ${userId}`,
    };
    return fetch(url, { ...options, headers });
  };

  // Sync index and stats on boot
  useEffect(() => {
    const storedId = localStorage.getItem("moodfit_user_id");
    const storedEmail = localStorage.getItem("moodfit_email");
    if (storedId && storedEmail) {
      setCurrentUser({ id: storedId, email: storedEmail });
    }
    fetchHistory();
    fetchCloset();
    fetchFavorites();
  }, []);

  const fetchHistory = async () => {
    setIsSidebarLoading(true);
    try {
      const res = await fetchWithAuth("/api/v1/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // suppress
    } finally {
      setIsSidebarLoading(false);
    }
  };

  const fetchCloset = async () => {
    setIsClosetLoading(true);
    try {
      const res1 = await fetchWithAuth("/api/v1/wardrobe/items");
      const res2 = await fetchWithAuth("/api/v1/wardrobe/stats");
      if (res1.ok && res2.ok) {
        const data1 = await res1.json();
        const data2 = await res2.json();
        setClosetItems(data1.items || []);
        setClosetStats(data2);
      }
    } catch {
      // suppress
    } finally {
      setIsClosetLoading(false);
    }
  };

  const fetchFavorites = async () => {
    try {
      const res = await fetchWithAuth("/api/v1/favorites");
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } catch {
      // suppress
    }
  };

  const handleToggleFavorite = async (item: any) => {
    try {
      const res = await fetchWithAuth("/api/v1/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outfit_id: item.outfit_id,
          image_url: item.image_url,
          style_tags: item.style_tags,
          source: item.source,
        }),
      });
      if (res.ok) {
        fetchFavorites();
      }
    } catch {
      // suppress
    }
  };

  const handleDeleteFavorite = async (outfitId: string) => {
    try {
      const res = await fetchWithAuth(`/api/v1/favorites/${outfitId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchFavorites();
      }
    } catch {
      // suppress
    }
  };

  const handlePredictSubmit = async (promptText: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetchWithAuth("/api/v1/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: promptText }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || err.error || "Retrieval error.");
      }

      const data = await response.json();
      setActiveSearch(data);
      fetchHistory(); // Sync sidebars
    } catch (err: any) {
      setErrorMsg(err.message || "Failed extracting custom aesthetic emotions.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistory = (record: any) => {
    setActiveSearch({
      search_id: record.id,
      dominant_emotion: record.dominant_emotion,
      mood_summary: record.mood_summary || `A classic, atmospheric ${record.dominant_emotion} design choice.`,
      emotion_breakdown: record.emotion_vector || { [record.dominant_emotion]: 1 },
      results: [], // results would query dynamically; fallback mock retrieves empty or matches list
    });
    // Trigger mock items fetch for selected records
    handlePredictSubmit(record.input_text);
  };

  // Auth Success helper
  const handleAuthSuccess = (userId: string, email: string) => {
    localStorage.setItem("moodfit_user_id", userId);
    localStorage.setItem("moodfit_email", email);
    setCurrentUser({ id: userId, email });
    setShowAuthModal(false);
    setErrorMsg(null);
    // Dynamic refresh
    fetchHistory();
    fetchCloset();
    fetchFavorites();
  };

  // Logout helper
  const handleLogout = () => {
    localStorage.removeItem("moodfit_user_id");
    localStorage.removeItem("moodfit_email");
    sessionStorage.removeItem("moodfit_guest_session");
    setGuestSession(false);
    setCurrentUser(null);
    setActiveSearch(null);
    setHistory([]);
    setClosetItems([]);
    setFavorites([]);
    setClosetStats({ total_items: 0, categories: {} });
    setActiveTab("predict");
    // Trigger anonymous reload
    setTimeout(() => {
      fetchHistory();
      fetchCloset();
      fetchFavorites();
    }, 100);
  };

  // Mock upload handlers for base64 uploads
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndStageFiles(Array.from(e.dataTransfer.files));
    }
  };

  const validateAndStageFiles = (files: File[]) => {
    if (files.length > 10) {
      alert("You can select up to 10 photos simultaneously inside preview container.");
      return;
    }
    const validated: File[] = [];
    for (const f of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        alert("Only JPEG, PNG and WEBP file types are accepted.");
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        alert("File size exceeds limit of 10MB per image.");
        return;
      }
      validated.push(f);
    }
    setStagedFiles(validated);
  };

  const handleUploadSubmit = async () => {
    if (stagedFiles.length === 0) return;
    setUploadState("uploading");

    try {
      // Read each File to base64 DataURL
      const readPromises = stagedFiles.map((file) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const base64List = await Promise.all(readPromises);
      setUploadState("polling");

      // Post as base64 list payload to Express
      const res = await fetchWithAuth("/api/v1/wardrobe/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: base64List }),
      });

      if (!res.ok) throw new Error("Upload post failed.");

      setUploadState("ready");
      setItemsExtracted(stagedFiles.length * 2); // segmented items mock multiplier
      fetchCloset();
      setStagedFiles([]);
    } catch {
      setUploadState("failed");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetchWithAuth(`/api/v1/wardrobe/items/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        setClosetItems(closetItems.filter((i) => i.id !== itemId));
        fetchCloset();
      }
    } catch {
      // suppress
    }
  };

  const isEntered = !!currentUser || guestSession;

  if (!isEntered) {
    return (
      <WelcomeEntrance
        onAuthSuccess={handleAuthSuccess}
        onContinueAsGuest={handleContinueAsGuest}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg text-app-text font-sans antialiased transition-colors duration-300">
      
      {/* 1. History Sidebar (Only shown when Retrieve tab is active) */}
      {activeTab === "predict" && (
        <HistorySidebar
          history={history}
          onSelectSearch={handleSelectHistory}
          isLoading={isSidebarLoading}
        />
      )}

      {/* Main Work Area */}
      <div className="flex-1 flex flex-col justify-between overflow-y-auto">
        
        {/* Navigation Navbar */}
        <header className="h-16 border-b border-tea-green/10 px-6 flex items-center justify-between bg-app-bg/40 backdrop-blur-md shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-camel to-light-bronze flex items-center justify-center font-bold text-app-bg italic shadow shadow-black/30">
              M
            </div>
            <div>
              <h1 className="font-sans font-extrabold text-sm tracking-widest text-text-title uppercase leading-none">
                MoodFit
              </h1>
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block mt-0.5">
                Poetry-to-Outfit Aesthetic Alignment
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Dynamic Theme Selection dropdown */}
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 shrink-0 transition-colors">
              <span className="text-[10px] font-mono uppercase text-slate-400">Theme:</span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="bg-transparent text-[11px] font-mono font-bold pr-1 outline-none cursor-pointer rounded border-none focus:ring-0 [&>option]:bg-app-card [&>option]:text-app-text"
                style={{ color: "var(--color-camel)" }}
              >
                <option value="classic">Tea Classic</option>
                <option value="cosmic-glow">Cosmic Glow</option>
                <option value="forest-dew">Forest Dew</option>
                <option value="sunset-terracotta">Sunset Warmth</option>
                <option value="lavender-frost">Lavender Frost</option>
              </select>
            </div>
            {/* User Session Info Badge */}
            {currentUser ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5">
                <User size={11} className="text-camel" />
                <span className="text-[10px] font-mono text-slate-300 truncate max-w-[120px]" title={currentUser.email}>
                  {currentUser.email.split("@")[0]}
                </span>
                <span className="text-[7.5px] bg-camel/15 text-camel border border-camel/10 px-1 rounded uppercase tracking-wider font-semibold">
                  Personal Box
                </span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-tea-green/5 border border-tea-green/10">
                <span className="h-1.5 w-1.5 rounded-full bg-tea-green animate-pulse" />
                <span className="text-[10px] font-mono text-tea-green">
                  Guest Workspace
                </span>
              </div>
            )}

            {activeTab === "predict" ? (
              <button
                onClick={() => setActiveTab("closet")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-tea-green/30 bg-tea-green/5 text-tea-green text-[11px] font-mono hover:bg-tea-green/15 transition uppercase outline-none cursor-pointer"
              >
                <Shirt size={12} /> Personal Closet Center
              </button>
            ) : (
              <button
                onClick={() => {
                  setActiveTab("predict");
                  setActiveSearch(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-camel/30 bg-camel/5 text-camel text-[11px] font-mono hover:bg-camel/15 transition uppercase outline-none cursor-pointer"
              >
                <ArrowLeft size={12} /> Back to Retrieve Workspace
              </button>
            )}

            {/* Sign in / Sign out controls */}
            {currentUser ? (
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition outline-none cursor-pointer"
                title="Disconnect your private vault session"
              >
                <LogOut size={16} />
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-camel/20 bg-camel/5 hover:bg-camel/15 text-camel text-[11px] font-mono transition uppercase cursor-pointer"
              >
                <LogIn size={12} />
                <span>Log In</span>
              </button>
            )}
          </div>
        </header>

        {/* Workspace body panels */}
        <main className="flex-grow p-6 md:p-12 max-w-5xl mx-auto w-full flex flex-col justify-center">
          
          {activeTab === "predict" ? (
            /* Tab Retrieval Moods */
            isLoading ? (
              <div className="text-center py-20 space-y-6 max-w-md mx-auto animate-fade-in">
                <Loader2 className="animate-spin text-red-500 mx-auto" size={40} />
                <div className="space-y-1.5">
                  <h4 className="text-xs font-mono tracking-widest text-slate-400 capitalize animate-pulse">
                    {LOADING_STATUSES[loadingStatusIndex]}
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-normal max-w-xs mx-auto">
                    Retrieving matching outfits using RoBERTa NLP classifiers and unit-normalized CLIP vectors.
                  </p>
                </div>
              </div>
            ) : activeSearch ? (
              <ResultsGrid
                dominantEmotion={activeSearch.dominant_emotion}
                moodSummary={activeSearch.mood_summary}
                emotionBreakdown={activeSearch.emotion_breakdown}
                results={activeSearch.results}
                onReset={() => setActiveSearch(null)}
                favoritedOutfitIds={favorites.map((f) => f.outfit_id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ) : (
              <div className="space-y-10 animate-fade-in py-4">
                <div className="text-center space-y-3 max-w-2xl mx-auto">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[9px] font-mono text-camel uppercase tracking-widest">
                    <Sparkles size={9} /> Model Retrieval Mode Active
                  </div>
                  <h2 className="text-3xl md:text-5xl font-sans font-light tracking-tight leading-none text-cornsilk">
                    Dress in the <span className="text-camel italic font-serif">Aura</span> of Your Words
                  </h2>
                  <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                    Analyze poetry verses, song lines, or emotional descriptions. Our double-model pipeline maps text to aligned outfits.
                  </p>
                </div>

                {errorMsg && (
                  <div className="p-3 border border-tea-green/20 bg-tea-green/5 rounded-xl text-center text-xs text-camel font-mono max-w-md mx-auto">
                    {errorMsg}
                  </div>
                )}

                <PredictForm onSubmit={handlePredictSubmit} isLoading={isLoading} />
              </div>
            )
          ) : !currentUser ? (
            /* Tab Closet with no active authenticated session */
            <div className="py-8 animate-fade-in">
              <AuthPortal
                onSuccess={(userId, email) => handleAuthSuccess(userId, email)}
                isClosetPrompt={true}
              />
            </div>
          ) : (
            /* Tab Closet Managements */
            <div className="space-y-8 animate-fade-in py-2">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Upload Section */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="p-5 rounded-2xl border border-white/5 bg-black/20 space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold">Refine Your Closet Index</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Drag or browse photos of your apparel. We run torchvision-segmentation models to extract crops, updating your personal FAISS indices in real time.
                      </p>
                    </div>

                    {/* Drag and Drop Container */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById("closet-file-input")?.click()}
                      className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[160px] ${
                        dragActive
                           ? "border-teal-500 bg-teal-500/5 text-teal-300"
                          : "border-[#336683]/20 bg-black/10 hover:border-[#669bbc]/40"
                      }`}
                    >
                      <input
                        id="closet-file-input"
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp"
                        onChange={(e) => e.target.files && validateAndStageFiles(Array.from(e.target.files))}
                        className="hidden"
                      />
                      <Upload className="text-slate-500 mb-2" size={24} />
                      {stagedFiles.length === 0 ? (
                        <div>
                          <p className="text-xs font-semibold">Drag-and-drop or click to browse</p>
                          <span className="text-[9px] text-slate-500">Max size 10MB (JPEG, PNG, WEBP)</span>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-teal-400">{stagedFiles.length} images staged</p>
                          <span className="text-[9px] text-slate-500 font-mono">Click to select different files</span>
                        </div>
                      )}
                    </div>

                    {/* Status Panel */}
                    {uploadState !== "idle" && (
                      <div className="p-3 text-xs rounded-lg border border-white/5 bg-black/25 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 uppercase font-mono">Process stage:</span>
                          <span className="font-bold font-mono text-teal-400 flex items-center gap-1.5">
                            {uploadState === "uploading" && "Uploading staged images..."}
                            {uploadState === "polling" && "Analyzing items and computing embeddings..."}
                            {uploadState === "ready" && "Index Rebuilt successfully!"}
                          </span>
                        </div>
                        {uploadState === "polling" && (
                          <div className="text-[10px] text-slate-500 font-mono leading-relaxed pt-1 select-none">
                            Calling segmenter and sentence-transformer vectors layers. Updates database item locations in real time...
                          </div>
                        )}
                      </div>
                    )}

                    {stagedFiles.length > 0 && uploadState !== "uploading" && uploadState !== "polling" && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={handleUploadSubmit}
                          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-mono font-bold hover:bg-teal-500 transition cursor-pointer"
                        >
                          Trigger Ingestion Inference
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dashboard Stats Panel */}
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl border border-white/5 bg-black/20 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#336683]/10 pb-2">
                      <BarChart3 className="text-teal-400" size={14} />
                      <h4 className="text-xs font-sans font-bold uppercase tracking-widest text-[#fdf0d5]">
                        Closet Registry Stats
                      </h4>
                    </div>

                    <div className="space-y-2 font-mono text-[11px]">
                      <div className="flex justify-between border-b border-white/[0.03] pb-1.5 text-slate-400">
                        <span>Total Items</span>
                        <span className="text-white font-bold">{closetStats.total_items || 0}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/[0.03] pb-1.5 text-slate-400">
                        <span>Index Engine</span>
                        <span className="text-teal-400 capitalize">{closetStats.index_status || "offline"}</span>
                      </div>

                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Categories:</span>
                        {Object.entries(closetStats.categories || {}).map(([cat, val]) => (
                          <div key={cat} className="flex justify-between text-slate-300">
                            <span className="capitalize">{cat}</span>
                            <span>{val as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-teal-500/10 bg-teal-950/10 text-[10px] text-slate-400 leading-normal flex items-start gap-2 select-none">
                    <Shield className="text-[#df817aff] shrink-0" size={13} />
                    <span>Personal items are segmented into private directories. Matches bypass international logs unless authorized manually.</span>
                  </div>
                </div>
              </div>

              {/* Clothes catalog grid library */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-2">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setClosetTab("wardrobe")}
                      className={`text-xs font-sans font-extrabold uppercase tracking-widest pb-2 border-b-2 transition outline-none cursor-pointer ${
                        closetTab === "wardrobe"
                          ? "border-camel text-camel"
                          : "border-transparent text-slate-400 hover:text-white"
                      }`}
                    >
                      Segmented Attic Closet ({closetItems.length})
                    </button>
                    <button
                      onClick={() => setClosetTab("favorites")}
                      className={`text-xs font-sans font-extrabold uppercase tracking-widest pb-2 border-b-2 transition outline-none cursor-pointer flex items-center gap-1.5 ${
                        closetTab === "favorites"
                          ? "border-camel text-camel"
                          : "border-transparent text-slate-400 hover:text-white"
                      }`}
                    >
                      <Heart size={12} className={closetTab === "favorites" ? "fill-camel text-camel" : ""} />
                      Bookmarked Favorites ({favorites.length})
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {closetTab === "wardrobe" ? "Interactive segment storage" : "Saved style alignments"}
                  </span>
                </div>

                {closetTab === "wardrobe" ? (
                  isClosetLoading ? (
                    <div className="text-center py-10 text-xs text-slate-500 font-mono">
                      Syncing closet items...
                    </div>
                  ) : closetItems.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-[#336683]/10 rounded-xl bg-black/10">
                      <Shirt className="mx-auto text-slate-600 mb-1.5 animate-pulse" size={28} />
                      <p className="text-xs text-slate-400 font-semibold">Closet registry empty.</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs mx-auto">
                        No segmented garments exist in database. Import files to proceed.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {closetItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/5 bg-black/25 overflow-hidden relative group hover:border-[#df817aff]/20 transition flex flex-col justify-between"
                        >
                          <div className="aspect-square relative overflow-hidden bg-slate-950">
                            <img
                              src={item.item_image_url}
                              alt="Segmented attic asset"
                              className="object-cover h-full w-full"
                            />
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/80 border border-white/10 text-red-400 hover:bg-red-950 hover:text-white transition scale-0 group-hover:scale-100 duration-150 outline-none cursor-pointer"
                              title="Delete and Rebuild Index"
                            >
                              <Trash2 size={10} />
                            </button>
                            <div className="absolute bottom-1.5 left-1.5 text-[8px] font-mono bg-black/75 text-camel border border-camel/10 px-1.5 py-0.5 rounded capitalize">
                              {item.category}
                            </div>
                          </div>

                          <div className="p-1.5 flex flex-wrap gap-1">
                            {item.style_tags.map((tag: string) => (
                              <span
                                key={tag}
                                className="text-[7.5px] font-mono bg-white/5 px-1 rounded text-slate-400"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  favorites.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-[#336683]/10 rounded-xl bg-black/10">
                      <Heart className="mx-auto text-slate-600 mb-1.5 animate-pulse" size={28} />
                      <p className="text-xs text-slate-400 font-semibold">No bookmarked outfits yet.</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs mx-auto">
                        Explore matching outfits in the retrieve tab, and save them by clicking the Heart icon.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {favorites.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/5 bg-black/25 overflow-hidden relative group hover:border-[#df817aff]/20 transition flex flex-col justify-between"
                        >
                          <div className="aspect-square relative overflow-hidden bg-slate-950">
                            <img
                              src={item.image_url}
                              alt="Bookmarked outfit match"
                              className="object-cover h-full w-full"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              onClick={() => handleDeleteFavorite(item.outfit_id)}
                              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/80 border border-white/10 text-red-400 hover:bg-red-950 hover:text-white transition scale-100 sm:scale-0 group-hover:scale-100 duration-150 outline-none cursor-pointer"
                              title="Delete bookmark"
                            >
                              <Trash2 size={10} />
                            </button>
                            <div className="absolute bottom-1.5 left-1.5 text-[8px] font-mono bg-black/75 text-camel border border-camel/10 px-1.5 py-0.5 rounded capitalize">
                              {item.source === "wardrobe" ? "Closet Item" : "DeepFashion"}
                            </div>
                          </div>

                          <div className="p-1.5 flex flex-wrap gap-1">
                            {item.style_tags.slice(0, 3).map((tag: string) => (
                              <span
                                key={tag}
                                className="text-[7.5px] font-mono bg-white/5 px-1 rounded text-slate-400 capitalize"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </main>

        {/* Footer info credits */}
        <footer className="h-12 border-t border-[#336683]/5 px-6 flex items-center justify-between shrink-0 text-[10px] text-slate-500 font-mono">
          <span>&copy; {new Date().getFullYear()} MOODFIT SYSTEM SYSTEM</span>
          <div className="flex gap-4">
            <span className="hover:text-slate-300 transition">DOCS</span>
            <span className="hover:text-slate-300 transition">FAISS RETRIEVAL</span>
            <span className="hover:text-slate-300 transition">ROBERTA TRAIN</span>
          </div>
        </footer>
      </div>

      {/* Auth Modal overlay popped of header Sign In click */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition outline-none cursor-pointer"
            >
              <X size={14} />
            </button>
            <AuthPortal
              onSuccess={(userId, email) => handleAuthSuccess(userId, email)}
              onCancel={() => setShowAuthModal(false)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
