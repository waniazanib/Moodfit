import React, { useState } from "react";
import { Mail, Lock, Eye, EyeOff, Loader2, Sparkles, CheckCircle2, UserPlus, LogIn, ArrowRight } from "lucide-react";
import GoogleAuthModal from "./GoogleAuthModal";

interface AuthPortalProps {
  onSuccess: (userId: string, email: string) => void;
  onCancel?: () => void;
  isClosetPrompt?: boolean;
}

export default function AuthPortal({ onSuccess, onCancel, isClosetPrompt = false }: AuthPortalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please fill in all credential fields.");
      return;
    }
    if (password.length < 5) {
      setErrorMsg("Password must contain at least 5 characters.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const apiPath = isRegister ? "/api/v1/auth/register" : "/api/v1/auth/login";

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      setSuccessMsg(isRegister ? "Registration successful! Loading your closet workspace..." : "Authentication approved! Welcome back.");
      
      // Delay slightly for visual satisfaction before calling success callback
      setTimeout(() => {
        onSuccess(data.user_id, data.email);
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during credential sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 md:p-8 rounded-3xl border border-white/5 bg-black/45 backdrop-blur-xl shadow-2xl space-y-6">
      
      <div className="text-center space-y-2">
        <div className="inline-flex h-10 w-10 rounded-full bg-gradient-to-tr from-[#9d0910]/20 to-[#c1121f]/20 border border-red-500/15 items-center justify-center text-red-400 mb-1">
          {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
        </div>
        
        {isClosetPrompt ? (
          <>
            <h3 className="text-xl font-sans font-bold tracking-tight text-[#fdf0d5]">
              Activate Secure Personal Closet
            </h3>
            <p className="text-xs text-slate-400 leading-normal max-w-xs mx-auto">
              Please sign up or sign in to segment your own apparel files and train custom dynamic FAISS search index.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-xl font-sans font-bold tracking-tight text-[#fdf0d5]">
              {isRegister ? "Join MoodFit System" : "Sign In to Your Workspace"}
            </h3>
            <p className="text-xs text-slate-400 leading-normal max-w-xs mx-auto">
              {isRegister 
                ? "Create a dedicated safe to persist search histories and crop catalogs." 
                : "Explore your dynamic poetry matching engine securely."}
            </p>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Email Address
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 pointer-events-none">
              <Mail size={14} />
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="villon@poetry.com"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/5 bg-white/[0.03] text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.05] transition font-sans"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Password Space
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 pointer-events-none">
              <Lock size={14} />
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/5 bg-white/[0.03] text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.05] transition font-sans"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300 transition outline-none"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Info alerts */}
        {errorMsg && (
          <div className="p-3 text-xs bg-red-950/20 border border-red-900/30 rounded-xl text-red-400 font-mono text-center leading-normal">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 text-xs bg-teal-950/30 border border-teal-500/20 rounded-xl text-teal-400 font-mono text-center flex items-center gap-2 justify-center">
            <CheckCircle2 size={13} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[#c1121f] hover:bg-[#ba181b] active:scale-[0.99] hover:shadow-lg hover:shadow-red-900/10 text-white text-xs font-mono font-bold tracking-uppercase uppercase tracking-wider transition flex items-center justify-center gap-2 outline-none disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="animate-spin text-white" size={13} />
          ) : (
            <>
              {isRegister ? "Complete Secure Registration" : "Authorize Session"}
              <ArrowRight size={13} />
            </>
          )}
        </button>

        {/* Continue with Google Option */}
        <button
          type="button"
          onClick={() => setShowGoogleModal(true)}
          className="w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] text-slate-100 text-xs font-mono font-bold uppercase tracking-wider transition flex items-center justify-center gap-2.5 cursor-pointer outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
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
          <span>Continue with Google</span>
        </button>
      </form>

      {/* Switch mode */}
      <div className="pt-2 text-center border-t border-white/[0.03] flex items-center justify-between text-xs text-slate-400">
        <span>
          {isRegister ? "Have an account already?" : "New poetry curator?"}
        </span>
        <button
          onClick={() => {
            setIsRegister(!isRegister);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className="text-red-400 hover:text-red-300 font-bold transition outline-none"
        >
          {isRegister ? "Sign In" : "Create Account"}
        </button>
      </div>

      {onCancel && (
        <div className="text-center pt-1">
          <button
            onClick={onCancel}
            className="text-[10px] font-mono text-slate-500 hover:text-slate-400 underline uppercase tracking-wider transition outline-none"
          >
            Explore anonymously with baseline index
          </button>
        </div>
      )}

      {/* Cloud-secure disclaimer */}
      <div className="flex gap-2 p-3 bg-white/[0.01] border border-white/[0.02] rounded-xl text-[9px] text-slate-500 leading-normal select-none">
        <Sparkles size={11} className="text-red-400 shrink-0 mt-0.5" />
        <span>Each account has personal data directories partitioned automatically. Image file arrays are segmented locally on safe client-side browser tokens.</span>
      </div>

      {/* Google Sign In Dialog Portal */}
      <GoogleAuthModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={onSuccess}
      />

    </div>
  );
}
