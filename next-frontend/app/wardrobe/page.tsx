/**
 * MoodFit — Closet Upload Center & Index Refiner (App Router)
 * next-frontend/app/wardrobe/page.tsx
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, CheckCircle, AlertTriangle, Trash2, Shield, Shirt, BarChart3, HelpCircle } from "lucide-react";
import { moodFitApi } from "../../utils/api";

export default function WardrobePage() {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "polling" | "ready" | "failed">("idle");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [itemsExtracted, setItemsExtracted] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  // Stats and list catalogs
  const [stats, setStats] = useState<any>({ total_items: 0, categories: {}, index_status: "empty" });
  const [items, setItems] = useState<any[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isItemsLoading, setIsItemsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStats();
    fetchItems();
  }, []);

  // Poll status when upload completes to sync background jobs
  useEffect(() => {
    let interval: any;
    if (uploadState === "polling" && batchId) {
      interval = setInterval(async () => {
        try {
          const res = await moodFitApi.getBatchStatus(batchId);
          if (res.status === "ready") {
            setUploadState("ready");
            setItemsExtracted(res.items_extracted);
            fetchStats();
            fetchItems();
            setFiles([]);
            clearInterval(interval);
          } else if (res.status === "failed") {
            setUploadState("failed");
            setErrorMsg(res.error_message || "Async segmenting failed.");
            clearInterval(interval);
          }
        } catch {
          // suppress
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [uploadState, batchId]);

  const fetchStats = async () => {
    setIsStatsLoading(true);
    try {
      const data = await moodFitApi.getWardrobeStats();
      setStats(data);
    } catch {
      // safe defaults
    } finally {
      setIsStatsLoading(false);
    }
  };

  const fetchItems = async () => {
    setIsItemsLoading(true);
    try {
      const data = await moodFitApi.getWardrobeItems(1, 40);
      setItems(data.items || []);
    } catch {
      // safe fallback
    } finally {
      setIsItemsLoading(false);
    }
  };

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
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndSetFiles(droppedFiles);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFiles = Array.from(e.target.files);
      validateAndSetFiles(selectedFiles);
    }
  };

  const validateAndSetFiles = (rawFiles: File[]) => {
    setErrorMsg(null);
    // Limit selection
    if (rawFiles.length > 50) {
      setErrorMsg("You can only upload up to 50 images at once.");
      return;
    }

    const validFiles: File[] = [];
    for (const f of rawFiles) {
      // Size check (10MB)
      if (f.size > 10 * 1024 * 1024) {
        setErrorMsg(`File ${f.name} is larger than maximum size (10MB).`);
        return;
      }
      // Type checks
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        setErrorMsg(`Unsupported file type: ${f.name}. Only JPEG, PNG or WEBP accepted.`);
        return;
      }
      validFiles.push(f);
    }
    setFiles(validFiles);
  };

  const handleUploadSubmit = async () => {
    if (files.length === 0) return;
    setUploadState("uploading");
    setProgressPercent(15);
    setErrorMsg(null);

    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));

      setProgressPercent(45);
      const res = await moodFitApi.uploadWardrobe(fd);
      setProgressPercent(75);
      setBatchId(res.batch_id);
      setProgressPercent(100);
      setUploadState("polling");
    } catch (err: any) {
      setUploadState("failed");
      setErrorMsg(err.message || "Upload process failed.");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await moodFitApi.deleteWardrobeItem(itemId);
      setItems(items.filter((i) => i.id !== itemId));
      fetchStats();
    } catch {
      // suppress
    }
  };

  return (
    <div className="min-h-screen bg-[#001424] text-gray-100 flex flex-col justify-between">
      
      {/* Header Navigation Options */}
      <header className="h-16 border-b border-[#336683]/10 px-6 md:px-12 flex items-center justify-between bg-[#001424]/40 backdrop-blur shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition font-mono uppercase tracking-wider"
        >
          <ArrowLeft size={14} /> Back to text workspace
        </Link>
        <span className="text-xs text-slate-400 font-display tracking-wider uppercase font-bold text-teal-400">
          Closet Upload Center & Vector indexer
        </span>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-grow p-6 md:p-12 max-w-6xl mx-auto w-full space-y-12">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT: DRAG DROP PANEL & STATUS REPORTS */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="rounded-2xl border border-white/5 bg-black/30 p-6 md:p-8 space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-display font-bold">Import Wardrobe Imagery</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Upload flat-lays of pojed-garments, mirror shots, or clear outfit portraits. The server segments items via torchvision FasterRCNN object extraction, computes CLIP vectors, and uploads individual garments.
                </p>
              </div>

              {/* Drag Area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[220px] ${
                  dragActive
                    ? "border-teal-500 bg-teal-500/5 text-teal-300"
                    : "border-[#336683]/20 bg-black/10 hover:border-[#669bbc]/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <Upload className="text-slate-500 mb-3" size={32} />
                
                {files.length === 0 ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Drag-and-drop or click to browse</p>
                    <p className="text-[11px] text-slate-500 font-mono">Accepts JPG, PNG, WEBP files up to 10MB per image</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-teal-400">{files.length} images staged ready</p>
                    <p className="text-[11px] text-slate-500 font-mono">Click here to swap selection</p>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-4 border border-red-950 bg-red-950/20 text-red-400 text-xs font-mono rounded-lg flex items-center gap-2">
                  <AlertTriangle size={14} /> {errorMsg}
                </div>
              )}

              {/* Execution Status Panel */}
              {uploadState !== "idle" && (
                <div className="p-4 rounded-xl border border-[#336683]/20 bg-[#003049]/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                      Pipeline State:
                    </span>
                    <span className="text-xs font-mono font-bold capitalize text-white flex items-center gap-2">
                      {uploadState === "uploading" && (
                        <>
                          <Loader2 className="animate-spin text-slate-400" size={12} />
                          Transferring images to cloud storage...
                        </>
                      )}
                      {uploadState === "polling" && (
                        <>
                          <Loader2 className="animate-spin text-teal-500" size={12} />
                          Extracting garments & updating FAISS...
                        </>
                      )}
                      {uploadState === "ready" && (
                        <>
                          <CheckCircle className="text-teal-400" size={14} />
                          Index Updated!
                        </>
                      )}
                      {uploadState === "failed" && (
                        <>
                          <AlertTriangle className="text-red-400" size={14} />
                          Failed
                        </>
                      )}
                    </span>
                  </div>

                  {/* Meter Bar */}
                  {uploadState === "uploading" && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Uploading files...</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadState === "polling" && (
                    <div className="text-xs text-slate-400 space-y-1.5">
                      <p className="flex items-center gap-2 font-mono text-[11px] text-teal-400">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-ping" />
                        Running Segmentations in background (slowapi/CPU safety buffer)...
                      </p>
                      <ul className="list-decimal pl-4 text-[10px] space-y-0.5 text-slate-500">
                        <li>Delineating garment clusters utilizing FasterRCNN bounding frames.</li>
                        <li>Feeding subcrops to Unit-Normalized CLIP processors.</li>
                        <li>Compiling flat vector listings inside local FAISS clusters.</li>
                        <li>Syncing indexed personal catalog paths back to Supabase.</li>
                      </ul>
                    </div>
                  )}

                  {uploadState === "ready" && (
                    <p className="text-xs text-teal-400 font-semibold">
                      Successfully segmented and mapped {itemsExtracted} garments into your personal aesthetic index catalog. Open text workspace and select personal matches.
                    </p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              {files.length > 0 && uploadState !== "uploading" && uploadState !== "polling" && (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleUploadSubmit}
                    className="px-6 py-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-lg text-xs font-mono uppercase tracking-widest transition flex items-center gap-2 shadow"
                  >
                    🚀 Trigger Pipeline Ingestion
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: CLOSET STATS SUMMARY */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-black/30 p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-[#336683]/10 pb-3">
                <BarChart3 className="text-teal-400" size={16} />
                <h4 className="text-xs font-display uppercase tracking-widest font-semibold">
                  Personal Closet Stats
                </h4>
              </div>

              {isStatsLoading ? (
                <div className="text-center py-8 text-xs text-slate-500 font-mono">
                  Loading statistics...
                </div>
              ) : (
                <div className="space-y-4 font-mono text-xs">
                  <div className="flex justify-between border-b border-white/[0.03] pb-2">
                    <span className="text-slate-400">Total Indexed Items</span>
                    <span className="font-bold text-white text-sm">{stats.total_items || 0}</span>
                  </div>

                  <div className="flex justify-between border-b border-white/[0.03] pb-2">
                    <span className="text-slate-400 font-sans">Index Vector System</span>
                    <span className="text-teal-400 uppercase text-[10px] bg-teal-950 border border-teal-500/20 px-2 rounded-full">
                      {stats.index_status || "offline"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <span className="text-slate-500 text-[10px] uppercase block tracking-wider">
                      Categories Distribution:
                    </span>
                    <div className="space-y-1.5 text-[11px]">
                      {Object.entries(stats.categories || {}).map(([cat, val]) => (
                        <div key={cat} className="flex justify-between text-slate-300">
                          <span className="capitalize">{cat}</span>
                          <span className="text-slate-400">{val as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Guidelines banner */}
            <div className="rounded-2xl border border-[#336683]/10 bg-[#003049]/10 p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#df817a]">
                <Shield size={14} />
                <h5 className="text-[11px] font-display font-semibold uppercase tracking-wider">
                  Indexed Integrity Protection
                </h5>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Personal clothing item crops are protected, only available to your authenticated profile. FAISS indexes bypass global searches unless explicitly filtered.
              </p>
            </div>
          </div>
        </div>

        {/* BOTTOM: EXPORT GARMENTS CATALOG GRAPHICS */}
        <div className="space-y-4 border-t border-[#336683]/10 pt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display uppercase tracking-widest text-slate-400">
              Extracted Catalog Library
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Count: {items.length} items
            </span>
          </div>

          {isItemsLoading ? (
            <div className="text-center py-24 text-xs text-slate-500 font-mono">
              Loading garments library...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[#336683]/10 rounded-2xl bg-black/10">
              <Shirt className="mx-auto text-slate-600 mb-2 animate-pulse" size={40} />
              <p className="text-sm text-slate-400 font-semibold">Closet catalog empty.</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No segmented garment representations exist. Use the drag Drop import panel above to start.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/5 bg-black/20 overflow-hidden relative group hover:border-red-500/20 transition flex flex-col justify-between"
                >
                  <div className="aspect-square relative overflow-hidden bg-slate-950">
                    <img
                      src={item.item_image_url}
                      alt="Segmented attire"
                      className="object-cover h-full w-full"
                    />
                    
                    {/* Trash deleting trigger */}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 text-red-400 hover:bg-red-900 border border-white/10 hover:text-white transition scale-0 group-hover:scale-100 duration-200"
                      title="Delete garment and trigger index recalculation"
                    >
                      <Trash2 size={11} />
                    </button>

                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[9px] font-mono text-teal-300 border border-teal-500/10 capitalize">
                      {item.category}
                    </div>
                  </div>

                  <div className="p-2 flex flex-wrap gap-1">
                    {item.style_tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="text-[8px] font-mono bg-white/5 px-1.5 py-0.5 rounded text-slate-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer bar */}
      <footer className="h-12 border-t border-[#336683]/5 px-6 flex items-center justify-between shrink-0 text-[10px] text-slate-500 font-mono mt-8">
        <span>&copy; {new Date().getFullYear()} MOODFIT CLOSET PLATFORM</span>
        <div className="flex gap-4">
          <span>TORCHVISION SEGM</span>
          <span>CLIP ENCODING</span>
          <span>FAISS CPU INDEX</span>
        </div>
      </footer>
    </div>
  );
}
