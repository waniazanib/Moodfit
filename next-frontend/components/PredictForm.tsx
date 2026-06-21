/**
 * MoodFit — Text Ingest component
 * next-frontend/components/PredictForm.tsx
 */

"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, HelpCircle } from "lucide-react";
import { MoodPredictSchema, MoodPredictInput } from "../utils/schemas";

interface PredictFormProps {
  onSubmit: (data: MoodPredictInput) => void;
  isLoading: boolean;
}

const EXPERIMENTS = [
  {
    title: "Melancholic Gloom",
    text: "The streets are empty, the rain fell soft upon cobblestones. An amber streetlight flickers slowly, catching whispers of forgotten autumn leaves.",
  },
  {
    title: "Romantic Springtime",
    text: "Your laughter echoes like sweet blossoms falling slowly onto velvet grass in the quiet warmth of a golden April peak.",
  },
  {
    title: "Energetic Brutalism",
    text: "Neon grids flashing under industrial beams. High-speed synthetic spikes, concrete walls roaring, raw energy pumping through wires.",
  },
];

export default function PredictForm({ onSubmit, isLoading }: PredictFormProps) {
  const [showHelper, setShowHelper] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<MoodPredictInput>({
    resolver: zodResolver(MoodPredictSchema),
  });

  const handleApplySample = (sample: string) => {
    setValue("text", sample);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full max-w-3xl mx-auto space-y-6"
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-display uppercase tracking-widest text-slate-300">
            Paste Poetry, Lyrics or Mood Description
          </label>
          <button
            type="button"
            onClick={() => setShowHelper(!showHelper)}
            className="text-slate-400 hover:text-white transition flex items-center gap-1 text-xs"
          >
            <HelpCircle size={14} /> Help Guidelines
          </button>
        </div>

        {showHelper && (
          <div className="bg-[#003049]/40 border border-[#336683]/20 rounded-lg p-4 mb-4 text-xs text-slate-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-slate-200">Writing Guidelines:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Keep submissions between 3 words and 512 total tokens.</li>
              <li>Avoid purely plain labels (e.g. "red shirt"). Rich adjectives get better embeddings.</li>
              <li>Poetry and narrative lyrics yield highly textured, cinematic aesthetic matches.</li>
            </ul>
          </div>
        )}

        <div className="relative">
          <textarea
            {...register("text")}
            rows={6}
            placeholder="e.g. 'Melancholic autumn evening in an empty street, wrapped in oversized charcoal wool...'"
            className="w-full rounded-xl border border-[#336683]/20 bg-black/40 p-4 text-sm text-gray-100 placeholder-slate-500 focus:border-[#669bbc] focus:ring-1 focus:ring-[#669bbc] outline-none transition"
          />
          {errors.text && (
            <p className="mt-2 text-xs text-[#c1121f] font-mono">
              {errors.text.message}
            </p>
          )}
        </div>
      </div>

      {/* Example Prompts */}
      <div>
        <span className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
          Or try writing-experiments:
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXPERIMENTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplySample(sample.text)}
              className="text-left p-3 rounded-lg border border-[#336683]/10 bg-[#003049]/20 hover:bg-[#003049]/45 hover:border-[#669bbc]/20 transition group"
            >
              <h5 className="text-xs font-semibold text-slate-300 group-hover:text-white mb-1">
                {sample.title}
              </h5>
              <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                "{sample.text}"
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Button */}
      <div className="flex justify-center pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="px-8 py-3.5 rounded-full bg-gradient-to-r from-[#9d0910] to-[#c1121f] text-white font-medium hover:from-[#c1121f] hover:to-[#df817aff] shadow-lg shadow-red-900/10 transition flex items-center gap-2 text-sm uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
          {isLoading ? "Analyzing..." : "Retrieve Matching Aesthetic"}
        </button>
      </div>
    </form>
  );
}
