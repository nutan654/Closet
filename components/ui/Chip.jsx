"use client";

import { motion } from "framer-motion";

/**
 * Small pill toggle — used for category tabs, fit selectors, filters.
 * `active` swaps it to a filled plum pill with a spring "settle" on select.
 */
export default function Chip({ children, active = false, onClick, className = "" }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      animate={{ scale: active ? 1.03 : 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className={`shrink-0 font-label font-medium text-xs px-4 py-2 rounded-pill whitespace-nowrap transition-colors ${
        active
          ? "bg-plum text-cream shadow-sm"
          : "bg-white/70 backdrop-blur-xs text-plum-soft border border-white/70"
      } ${className}`}
    >
      {children}
    </motion.button>
  );
}
