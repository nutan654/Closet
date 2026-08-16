"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Button from "./Button";

/**
 * components/ui/ConfirmDialog.jsx
 *
 * App-wide, promise-based confirmation modal — `const ok = await
 * confirm({ title, message, danger })`. Exists so destructive actions
 * (deleting an item, deleting a saved outfit) always get a real "are you
 * sure" step instead of firing instantly on a single tap, which was the
 * previous behavior everywhere a delete existed.
 */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    setState(opts);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function handle(result) {
    setState(null);
    resolver.current?.(result);
    resolver.current = null;
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-plum/35 backdrop-blur-[2px] z-[250] flex items-center justify-center px-6"
            onClick={(e) => e.target === e.currentTarget && handle(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="bg-cream w-full max-w-[360px] rounded-lg p-5 shadow-lg"
            >
              <h3 className="text-lg font-title text-plum mb-1">{state.title}</h3>
              {state.message && (
                <p className="text-sm font-body text-plum-soft leading-relaxed mb-5">{state.message}</p>
              )}
              <div className="flex gap-2 mt-2">
                <Button variant="secondary" className="flex-1" onClick={() => handle(false)}>
                  {state.cancelLabel || "Cancel"}
                </Button>
                <Button
                  variant="primary"
                  className={`flex-1 ${state.danger ? "!bg-pink-deep hover:!bg-[#D99BAC]" : ""}`}
                  onClick={() => handle(true)}
                >
                  {state.confirmLabel || "Confirm"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
