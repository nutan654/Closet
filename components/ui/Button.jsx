"use client";

import { motion } from "framer-motion";

/**
 * Premium pill button — Step 11 of the design pass.
 *   variant="primary"   deep plum fill, soft shadow, lifts on hover
 *   variant="secondary" cream glass, subtle border, lifts on hover
 *   variant="ghost"     no fill, for low-emphasis actions inside cards
 *
 * Always renders as a real <button> (or <a> via `as="a"`) so it stays
 * accessible — framer-motion just adds the interaction polish on top.
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  as = "button",
  ...props
}) {
  const base =
    "font-button font-semibold rounded-pill inline-flex items-center justify-center gap-2 transition-colors select-none disabled:opacity-40 disabled:pointer-events-none";

  const sizes = {
    sm: "text-xs px-3.5 py-1.5",
    md: "text-sm px-5 py-2.5",
    lg: "text-base px-7 py-3.5",
  };

  const variants = {
    primary: "bg-plum text-cream shadow-md hover:bg-[#4A3240]",
    secondary:
      "bg-white/70 backdrop-blur-xs text-plum border border-white/80 shadow-sm hover:bg-white/90",
    ghost: "bg-transparent text-plum-soft hover:text-plum",
  };

  const Comp = motion[as] || motion.button;

  return (
    <Comp
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </Comp>
  );
}
