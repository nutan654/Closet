"use client";

import { useStore } from "@/lib/StoreContext";
import { useAuth } from "@/lib/AuthContext";

const GREETINGS = ["Welcome home", "Hello, gorgeous", "So good to see you", "Your little world awaits"];

// Sign-out lives here, in TopBar's own icon row — TopBar renders on every
// route (see every app/*/page.js), so this is the one consistent place
// for it. AppShell previously *also* rendered a fixed top-right door
// button that called the exact same AuthContext.logout() (since the
// Phase 4.3 identity migration rewired the old "switch profile" action to
// a full sign-out — see lib/StoreContext.jsx's switchProfile()), so every
// screen showed two overlapping door icons doing the identical thing.
// Phase 5.1 polish: consolidated into this single row.
export default function TopBar({ title }) {
  const { data, profileName } = useStore();
  const { logout } = useAuth();
  const hour = new Date().getHours();
  const sub = hour < 11 ? "good morning" : hour < 17 ? "good afternoon" : "good evening";
  const base = title || GREETINGS[new Date().getDate() % GREETINGS.length];
  const greeting = title ? title : `${base}, ${profileName}`;

  function handleExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `closet-${profileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center justify-between px-1 pt-6 pb-3">
      <div>
        <h1 className="text-2xl font-title text-plum leading-tight">{greeting}</h1>
        <p className="font-heading-serif italic text-[15px] text-plum-soft mt-0.5">{sub} ✨</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-xs border border-white/80 shadow-sm grid place-items-center text-sm hover:bg-white/90 transition-colors"
          title="Export your data"
          aria-label="Export your data"
        >
          ⬇️
        </button>
        <button
          onClick={logout}
          className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-xs border border-white/80 shadow-sm grid place-items-center text-sm hover:bg-white/90 transition-colors"
          title="Sign out"
          aria-label="Sign out"
        >
          🚪
        </button>
      </div>
    </div>
  );
}
