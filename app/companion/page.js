"use client";

import { useState, useRef, useEffect } from "react";
import { useStore } from "@/lib/StoreContext";
import { chatWithBear } from "@/lib/api/companion";
import TopBar from "@/components/TopBar";

// Cute, cheap-to-render bear-paw wallpaper for the Companion header card —
// a single tiny inline SVG tile repeated via CSS background-image, so
// there's no extra image asset to fetch (and nothing that can 404).
const PAW_PATTERN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>
      <g fill='#5B3E4A' fill-opacity='0.07'>
        <ellipse cx='16' cy='40' rx='7' ry="9"/>
        <circle cx='7' cy='28' r='3.4'/>
        <circle cx='14' cy='22' r='3.4'/>
        <circle cx='22' cy='24' r='3.4'/>
        <circle cx='27' cy='31' r='3.2'/>
      </g>
    </svg>`
  );

export default function CompanionPage() {
  const { data } = useStore();
  const tips = [];

  data.items
    .filter((i) => i.consumable && i.inventoryPercent <= 20)
    .forEach((i) => tips.push(`Your ${i.name} is at ${i.inventoryPercent}% — maybe add it to your wishlist?`));

  if (!tips.length) tips.push("Everything looks in order — nothing urgent today. Just vibes. ✨");

  // Chat state lives only in memory (see lib/api/companion.js / the
  // backend handler's own doc comment) — a reload starts a fresh
  // conversation with Bear, same as every other "coming soon" surface in
  // this app didn't persist anything either. `messages` is the visible
  // conversation; `sending` disables the input mid-request rather than
  // letting someone queue up five messages before the first reply lands;
  // `error` is a real failure (network/timeout/Bear not configured), not
  // a fake reply.
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;

    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text }]);
    setDraft("");
    setError("");
    setSending(true);
    try {
      const result = await chatWithBear(text, history);
      setMessages((m) => [...m, { role: "assistant", text: result.reply }]);
    } catch (err) {
      // err.message is already a safe, friendly string (see
      // lib/api/client.js's ApiError) — including the backend's own
      // "Bear isn't set up yet" message when GEMINI_API_KEY is unset.
      // Shown as a standalone notice rather than a fake bubble from
      // Bear, and the person's own message stays in the thread so
      // nothing they typed is lost.
      setError(err?.message || "Bear didn't catch that — try again?");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <main className="px-5">
      <TopBar title="Bear 🐻" />

      <div
        className="relative rounded-lg p-6 text-center shadow-md bg-gradient-to-br from-peach to-lavender overflow-hidden border border-white/60"
        style={{ backgroundImage: `${PAW_PATTERN ? `url("${PAW_PATTERN}")` : "none"}`, backgroundSize: "64px 64px" }}
      >
        <span className="absolute top-3 left-4 text-lg sparkle">🐾</span>
        <span className="absolute top-6 right-6 text-sm sparkle" style={{ animationDelay: "1.2s" }}>✨</span>
        <span className="text-5xl inline-block drop-shadow-sm">🐻</span>
        <h2 className="mt-2 font-title text-lg text-plum">Hi, I&apos;m Bear — I&apos;ve been watching your closet</h2>
        <p className="text-sm font-heading-serif italic text-plum-soft mt-1">Here&apos;s what I noticed today</p>
      </div>

      <div className="flex flex-col gap-2.5 mt-3.5">
        {tips.map((t, i) => (
          <div key={i} className="bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 flex gap-2.5 items-start">
            <span className="text-base leading-none mt-0.5">🐾</span>
            <span className="text-sm font-body text-plum leading-snug">{t}</span>
          </div>
        ))}
      </div>

      {/*
        Real chat thread with Bear (POST /api/v1/companion/chat, see
        lib/api/companion.js) — only rendered once there's something to
        show, so a first-time visit still looks exactly like the tips
        card above with an empty input underneath.
      */}
      {messages.length > 0 && (
        <div ref={listRef} className="flex flex-col gap-2.5 mt-3.5 max-h-[46vh] overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-md shadow-sm p-3 text-sm font-body leading-snug ${
                m.role === "user"
                  ? "self-end bg-plum text-cream"
                  : "self-start bg-white/70 backdrop-blur-xs border border-white/70 text-plum"
              }`}
            >
              {m.role === "assistant" && <span className="mr-1.5">🐻</span>}
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="self-start bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3 text-sm font-body text-plum-soft italic">
              🐻 Bear is thinking…
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs font-label text-pink-deep mt-2 text-center">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-2 bg-white/70 backdrop-blur-xs border border-white/70 rounded-pill shadow-sm px-2 py-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          placeholder="Chat with Bear about your closet…"
          aria-label="Chat with Bear"
          className="flex-1 bg-transparent border-none outline-none px-2.5 text-sm font-body text-plum placeholder:text-plum-soft/70 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          aria-label="Send"
          className="w-9 h-9 rounded-full bg-plum text-cream grid place-items-center text-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          ➤
        </button>
      </div>
    </main>
  );
}
