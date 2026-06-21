import React, { useState } from "react";
import { X, Loader2, Sparkles, User, ChevronRight, Mail } from "lucide-react";

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (userId: string, email: string) => void;
}

export default function GoogleAuthModal({ isOpen, onClose, onSuccess }: GoogleAuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectAccount = async (email: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Google authentication failed.");
      }
      setTimeout(() => {
        onSuccess(data.user_id, data.email);
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err.message || "Could not authenticate Google account.");
      setLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customEmail.includes("@")) {
      setErrorMsg("Please enter a valid Google email address.");
      return;
    }
    handleSelectAccount(customEmail);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 text-white p-6 shadow-2xl space-y-6">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer outline-none"
        >
          <X size={14} />
        </button>

        {/* Google Header */}
        <div className="text-center space-y-2">
          {/* Custom Stylized Google Logo Icon */}
          <div className="inline-flex h-12 w-12 rounded-full bg-white items-center justify-center shadow-md mb-1">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          </div>

          <h3 className="text-base font-sans font-bold text-slate-100">
            Sign in with Google
          </h3>
          <p className="text-xs text-slate-400">
            to continue to <span className="font-bold text-[#df817a]">MoodFit</span>
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="animate-spin text-red-500 mx-auto" size={24} />
            <p className="text-xs text-slate-400 font-mono">Authenticating secure single-sign-on token...</p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Account List */}
            {!showCustomInput && (
              <div className="space-y-2">
                {/* 1. Primary Owner Account */}
                <button
                  type="button"
                  onClick={() => handleSelectAccount("waniazanib1289@gmail.com")}
                  className="w-full p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition flex items-center justify-between group outline-none text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-red-900/30 border border-red-500/20 flex items-center justify-center text-red-400 font-bold uppercase text-xs">
                      W
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Wania Zanib</p>
                      <p className="text-[10px] text-slate-400 font-mono">waniazanib1289@gmail.com</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 transition" />
                </button>

                {/* 2. Secondary Guest Account */}
                <button
                  type="button"
                  onClick={() => handleSelectAccount("guest.curator@gmail.com")}
                  className="w-full p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition flex items-center justify-between group outline-none text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-teal-900/30 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold uppercase text-xs">
                      G
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Guest Curator</p>
                      <p className="text-[10px] text-slate-400 font-mono">guest.curator@gmail.com</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 transition" />
                </button>

                {/* 3. Custom account option */}
                <button
                  type="button"
                  onClick={() => setShowCustomInput(true)}
                  className="w-full p-2.5 rounded-xl border border-dashed border-white/10 hover:border-white/20 hover:bg-white/[0.01] transition flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-200 outline-none cursor-pointer"
                >
                  <User size={13} />
                  <span>Use another Google Account</span>
                </button>
              </div>
            )}

            {/* Custom Email Input */}
            {showCustomInput && (
              <form onSubmit={handleCustomSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    Google Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      <Mail size={13} />
                    </span>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="username@gmail.com"
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.05] transition font-sans"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomInput(false);
                      setErrorMsg(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs font-mono transition cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-[#c1121f] text-white text-xs font-mono font-bold hover:bg-[#ba181b] transition cursor-pointer"
                  >
                    Select Account
                  </button>
                </div>
              </form>
            )}

            {/* Display error if any */}
            {errorMsg && (
              <div className="p-3 text-xs bg-red-950/20 border border-red-900/30 rounded-xl text-red-400 font-mono text-center">
                {errorMsg}
              </div>
            )}

            {/* Google privacy info */}
            <div className="pt-2 text-center border-t border-white/[0.03] text-[9.5px] text-slate-500 leading-normal">
              To proceed, Google will share your name, email address, language preference, and profile picture with MoodFit.
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
