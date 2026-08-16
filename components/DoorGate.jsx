"use client";

import { useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/AuthContext";

/**
 * @param {(credentials: { email: string, password: string }) => Promise<unknown>} onLogin
 * @param {(payload: { name: string, email: string, password: string }) => Promise<unknown>} onSignup
 */
export default function DoorGate({ onLogin, onSignup }) {
  const [stage, setStage] = useState("door"); // door | knocking | open | form
  const [mode, setMode] = useState("login"); // login | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const doorControls = useAnimation();
  const knockerControls = useAnimation();

  async function handleKnock() {
    if (stage !== "door") return;
    setStage("knocking");
    for (let i = 0; i < 3; i++) {
      knockerControls.start({ rotate: [0, -22, 4, 0], transition: { duration: 0.22 } });
      // eslint-disable-next-line no-await-in-loop
      await doorControls.start({ x: [0, -3, 3, -1, 0], transition: { duration: 0.22 } });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 90));
    }
    setStage("open");
    await doorControls.start({
      rotateY: -108,
      transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
    });
    setStage("form");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !password) return;
    if (mode === "signup" && !trimmedName) return;

    setSubmitting(true);
    try {
      if (mode === "signup") {
        await onSignup({ name: trimmedName, email: trimmedEmail, password });
      } else {
        await onLogin({ email: trimmedEmail, password });
      }
      // On success, AppShell re-renders away from DoorGate entirely once
      // isAuthenticated flips — nothing further to do here.
    } catch (err) {
      // err.message comes straight from the backend's own friendly text
      // (e.g. "invalid email or password", "an account with this email
      // already exists", or a plain-language validation message) — never
      // a stack trace or internal detail, so it's safe to show as-is.
      setError(err?.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleDemo() {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await onLogin({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setError("");
  }

  const dimmed = stage === "open" || stage === "form";

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#FFE7CF] via-[#FFF3EC] to-[#FBE0E8] flex flex-col items-center justify-center px-6">
      {/* ambient clouds */}
      <div className="absolute top-10 left-8 w-16 h-8 rounded-full bg-white/70" />
      <div className="absolute top-16 left-16 w-10 h-6 rounded-full bg-white/60" />
      <div className="absolute top-8 right-10 w-20 h-9 rounded-full bg-white/60" />

      {/* grass strip */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-sage/70 rounded-t-[40%]" />
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-sage-deep/50" />

      <div className="relative z-10 flex flex-col items-center">
        {/* hanging sign */}
        <div className="flex flex-col items-center mb-1">
          <div className="w-0.5 h-5 bg-plum-soft/60" />
          <div className="sign-sway bg-white rounded-md shadow-sm px-4 py-1.5 border-2 border-peach-deep">
            <span className="font-title text-sm text-plum">Closet ♡</span>
          </div>
        </div>

        {/* door + house facade — sized down on the smallest phones
            (360-390px) so the door + both side plants + gaps (≈336px)
            don't overflow the available content width (≈312-342px after
            px-6 padding) and clip against the container's overflow-hidden;
            back to full size from the sm: breakpoint up. */}
        <div className="relative flex items-end gap-1.5 sm:gap-2" style={{ perspective: 900 }}>
          {/* left plant */}
          <div className="mb-2 text-3xl sm:text-4xl -rotate-6 select-none" aria-hidden>🪴</div>

          {/* house wall behind door */}
          <div className="relative w-48 h-80 sm:w-60 sm:h-96 bg-[#FFF0E0] rounded-t-[90px] sm:rounded-t-[110px] shadow-md flex items-end justify-center pb-3 border-4 border-white">
            {/* window with flower box */}
            <div className="absolute top-8 left-4 w-10 h-10 rounded-md bg-[#CFE7FF] border-2 border-white shadow-sm" />
            <div className="absolute top-16 left-3 text-base" aria-hidden>🌸</div>
            <div className="absolute top-8 right-4 w-10 h-10 rounded-md bg-[#CFE7FF] border-2 border-white shadow-sm" />
            <div className="absolute top-16 right-3 text-base" aria-hidden>🌿</div>

            {/* the door itself */}
            <motion.button
              onClick={handleKnock}
              animate={doorControls}
              style={{ transformOrigin: "left center", transformStyle: "preserve-3d" }}
              className="relative w-28 h-48 sm:w-32 sm:h-56 rounded-t-[52px] sm:rounded-t-[64px] bg-gradient-to-b from-[#D98B54] to-[#B06A38] border-4 border-[#8B4A2B] shadow-inner cursor-pointer"
              aria-label="Knock on the door"
              disabled={stage !== "door"}
            >
              {/* plank lines */}
              <div
                className="absolute inset-1 rounded-t-[56px] pointer-events-none"
                style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 20px)" }}
              />
              {/* oval window */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-12 h-16 rounded-full bg-[#FFEFC9] border-4 border-[#8B4A2B]" />
              {/* knob */}
              <div className="absolute right-3 top-1/2 w-3 h-3 rounded-full bg-[#F4E1B8] shadow-sm" />
              {/* knocker */}
              <motion.div
                animate={knockerControls}
                style={{ transformOrigin: "top center" }}
                className="absolute left-1/2 -translate-x-1/2 top-32 w-7 h-7 rounded-full bg-[#F4E1B8] border-2 border-[#8B4A2B]"
              />
            </motion.button>

            {/* welcome mat */}
            <div className="absolute -bottom-2 w-24 h-3 rounded-full bg-[#9C7A87]/40" />
          </div>

          {/* right plant */}
          <div className="mb-1 text-3xl sm:text-4xl rotate-6 select-none" aria-hidden>🌿</div>
        </div>

        {stage === "door" && (
          <p className="mt-5 text-sm font-bold text-plum-soft animate-bounce">Tap the door to knock ✨</p>
        )}
        {stage === "knocking" && (
          <p className="mt-5 text-sm font-bold text-plum-soft">knock knock… 🚪</p>
        )}
      </div>

      {dimmed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="fixed inset-0 bg-plum/25 z-20"
        />
      )}

      {stage === "form" && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed bottom-0 left-0 right-0 z-30 flex justify-center px-5 pb-8"
        >
          <div className="bg-cream w-full max-w-sm rounded-t-lg shadow-lg p-5">
            <div className="w-10 h-1.5 bg-line rounded-full mx-auto mb-3" />
            <h2 className="font-display text-lg text-center mb-1">Who&apos;s there? 🌷</h2>
            <p className="text-xs text-plum-soft text-center mb-4">
              {mode === "signup"
                ? "Set up your own closet — it's just for you."
                : "Sign in to open your closet."}
            </p>

            <div className="flex justify-center gap-1 mb-4">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  mode === "login" ? "bg-plum text-cream" : "bg-white/70 text-plum-soft"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  mode === "signup" ? "bg-plum text-cream" : "bg-white/70 text-plum-soft"
                }`}
              >
                New here
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              {mode === "signup" && (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya"
                  aria-label="Your name"
                  autoComplete="name"
                  className="border border-line rounded-sm px-3 py-2.5 text-center"
                />
              )}
              <input
                autoFocus={mode === "login"}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                autoComplete="email"
                className="border border-line rounded-sm px-3 py-2.5 text-center"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "create a password" : "password"}
                aria-label={mode === "signup" ? "Create a password" : "Password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="border border-line rounded-sm px-3 py-2.5 text-center"
              />

              {error && <p role="alert" className="text-[11px] text-center text-pink-deep font-semibold px-1">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="bg-plum text-cream py-2.5 rounded-full font-bold disabled:opacity-60"
              >
                {submitting ? "One moment…" : mode === "signup" ? "Create my closet →" : "Step inside →"}
              </button>
            </form>

            {mode === "login" && (
              <button
                type="button"
                onClick={handleDemo}
                disabled={submitting}
                className="w-full text-center text-xs text-plum-soft underline mt-3 disabled:opacity-60"
              >
                Just want to look around? Try the demo — no account needed
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
