"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * components/ui/Toast.jsx
 *
 * Lightweight, app-wide toast system. Wrap the app once in <ToastProvider>
 * (see app/layout.js) and call useToast() from anywhere to surface quick,
 * non-blocking feedback ("Saved to your closet", "Couldn't save this
 * item"...) instead of actions silently succeeding/failing with no
 * confirmation at all — the polish gap that made every add/delete/equip
 * action feel a little uncertain.
 */

const ToastContext = createContext(null);
let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, { type = "success", duration = 2800 } = {}) => {
      const id = ++idCounter;
      setToasts((t) => [...t, { id, message, type }]);
      window.setTimeout(() => remove(id), duration);
      return id;
    },
    [remove]
  );

  const api = useRef({
    success: (message, opts) => push(message, { ...opts, type: "success" }),
    error: (message, opts) => push(message, { ...opts, type: "error" }),
    info: (message, opts) => push(message, { ...opts, type: "info" }),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 left-0 right-0 z-[300] flex flex-col items-center gap-2 px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              role="status"
              className={`pointer-events-auto max-w-[calc(100vw-2rem)] sm:max-w-sm px-4 py-2.5 rounded-pill shadow-lg border text-sm font-label font-semibold flex items-center gap-2 ${
                t.type === "error"
                  ? "bg-pink-deep text-white border-pink-deep"
                  : t.type === "info"
                  ? "bg-white/95 backdrop-blur-xs text-plum border-white/80"
                  : "bg-plum text-cream border-plum"
              }`}
            >
              <span className="shrink-0">{t.type === "error" ? "⚠️" : t.type === "info" ? "✨" : "✓"}</span>
              <span className="truncate">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
