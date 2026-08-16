"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useStore } from "@/lib/StoreContext";
import DoorGate from "@/components/DoorGate";
import BottomNav from "@/components/BottomNav";
import Onboarding from "@/components/Onboarding";

const ONBOARDING_PREFIX = "lifecloset_onboarded_";

/**
 * Phase 4.3 update: StoreContext now reads identity from AuthContext
 * itself (see lib/StoreContext.jsx), so the manual enterProfile()/
 * switchProfile() bridge this component used in Phase 4.2 is gone —
 * there's nothing left for AppShell to hand off by hand. What's left is
 * gating render on whichever of AuthContext's or StoreContext's loading/
 * error state currently applies.
 */
export default function AppShell({ children }) {
  const { user, isAuthenticated, isLoading: authLoading, login, signup } = useAuth();
  const { data, isLoading: dataLoading, error, reload } = useStore();

  // First-run tutorial (Home > Wardrobe > Vanity > save-a-look walkthrough).
  // Shown once per account, tracked per user id so a shared browser or a
  // second account on the same device each still gets their own intro.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!data || !user?.id) return;
    try {
      if (!window.localStorage.getItem(ONBOARDING_PREFIX + user.id)) {
        setShowOnboarding(true);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — skip onboarding
      // rather than crash the app over a nice-to-have.
    }
  }, [data, user]);

  function finishOnboarding() {
    setShowOnboarding(false);
    try {
      if (user?.id) window.localStorage.setItem(ONBOARDING_PREFIX + user.id, "1");
    } catch {
      // see note above
    }
  }

  // Never flash the wrong state (Phase 4.2 brief, section 11): LOADING
  // (auth bootstrap, or the initial items/outfits fetch once
  // authenticated) comes first, then UNAUTHENTICATED, then a load ERROR,
  // and only then the real, data-ready AUTHENTICATED app.
  if (authLoading || (isAuthenticated && dataLoading && !data)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#FFE7CF] via-[#FFF3EC] to-[#FBE0E8]">
        <p className="font-heading-serif italic text-plum-soft text-sm">opening the closet…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <DoorGate onLogin={login} onSignup={signup} />;
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-8 text-center bg-gradient-to-b from-[#FFE7CF] via-[#FFF3EC] to-[#FBE0E8]">
        <p className="font-heading-serif italic text-plum-soft text-sm">{error}</p>
        <button onClick={reload} className="px-4 py-2 rounded-full bg-plum text-cream text-xs font-bold">
          Try again
        </button>
      </div>
    );
  }

  // Authenticated, but the initial load hasn't resolved into `data` yet —
  // render nothing for a tick rather than flashing a stale/empty state.
  if (!data) return null;

  // Sign-out now lives in TopBar's own icon row (every route renders
  // TopBar — see app/*/page.js), not a second fixed-position button here.
  // Two door icons stacked in the same corner on every screen was a
  // duplicated-navigation bug — see Phase 5.1 polish pass / TopBar.jsx.
  return (
    <>
      <div className="max-w-[480px] mx-auto min-h-screen relative pb-24 screen-fade">{children}</div>
      <BottomNav />
      <AnimatePresence>{showOnboarding && <Onboarding onDone={finishOnboarding} />}</AnimatePresence>
    </>
  );
}
