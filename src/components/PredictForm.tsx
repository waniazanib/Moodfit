import React, { useState } from "react";
import { Sparkles, HelpCircle } from "lucide-react";

interface PredictFormProps {
  onSubmit: (text: string) => void;
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
  const [text, setText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHelper, setShowHelper] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const words = text.trim().split(/\s+/);
    if (!text || words.length < 3) {
      setErrorMsg("At least 3 words are required to extract a distinct mood.");
      return;
    }
    if (words.length > 512) {
      setErrorMsg("Input exceeds maximum limit of 512 words.");
      return;
    }

    onSubmit(text);
  };

  const handleApplySample = (sample: string) => {
    setText(sample);
  };

  return (
    <div id="predict-form" className="w-full max-w-3xl mx-auto space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-sans font-bold uppercase tracking-wider text-slate-300">
              Paste Poetry, Lyrics or Mood Description
            </label>
            <button
              type="button"
              onClick={() => setShowHelper(!showHelper)}
              className="text-slate-400 hover:text-white transition flex items-center gap-1 text-xs outline-none"
            >
              <HelpCircle size={13} /> Help Guidelines
            </button>
          </div>

          {showHelper && (
            <div className="bg-[#003049]/40 border border-[#336683]/20 rounded-lg p-4 mb-4 text-xs text-slate-300 space-y-2 leading-relaxed">
              <p className="font-semibold text-slate-200">Writing Guidelines:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Keep submissions between 3 words and 512 total words.</li>
                <li>Avoid purely plain labels (e.g. "red shirt"). Rich adjectives get better embeddings.</li>
                <li>Poetry and narrative lyrics yield highly textured, cinematic aesthetic matches.</li>
              </ul>
            </div>
          )}

          <div className="relative">
            <textarea
              id="mood-prompt-textarea"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              rows={5}
              placeholder="e.g. 'Melancholic autumn evening in an empty street, wrapped in oversized charcoal wool...'"
              className="w-full rounded-xl border border-camel/20 bg-app-card/40 p-4 text-sm text-app-text placeholder-app-text/30 focus:border-camel focus:ring-1 focus:ring-camel outline-none transition"
            />
            {errorMsg && (
              <p id="validation-error" className="mt-2 text-xs text-[#df817a] font-mono">
                {errorMsg}
              </p>
            )}
          </div>
        </div>

        {/* Example Prompts */}
        <div className="space-y-2">
          <span className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Or try writing-experiments:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {EXPERIMENTS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                id={`sample-prompt-btn-${idx}`}
                onClick={() => handleApplySample(sample.text)}
                className="text-left p-3 rounded-lg border border-[#336683]/10 bg-[#003049]/20 hover:bg-[#003049]/45 hover:border-[#669bbc]/20 transition group outline-none"
              >
                <h5 className="text-[11px] font-semibold text-slate-300 group-hover:text-white mb-1">
                  {sample.title}
                </h5>
                <p className="text-[10px] text-slate-500 line-clamp-2 italic leading-relaxed">
                  "{sample.text}"
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Button */}
        <div className="flex justify-center pt-3">
          <button
            type="submit"
            id="retrieve-aesthetic-btn"
            disabled={isLoading}
            className="px-8 py-3 rounded-full bg-gradient-to-r from-[#9d0910] to-[#c1121f] text-white font-medium hover:from-[#c1121f] hover:to-[#df817aff] shadow-lg shadow-red-950/20 transition flex items-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed group outline-none"
          >
            <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
            {isLoading ? "Aligning..." : "Retrieve Matching Aesthetic"}
          </button>
        </div>
      </form>
    </div>
  );
}
