"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/wardrobe", label: "Wardrobe", icon: "👗" },
  { href: "/vanity", label: "Vanity", icon: "🪞" },
  { href: "/collections", label: "Boxes", icon: "📦" },
  { href: "/journal", label: "Journal", icon: "📝" },
  { href: "/companion", label: "Bear", icon: "🐻" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
      style={{ background: "linear-gradient(to top, rgba(255,253,251,0.9), rgba(255,253,251,0))" }}
    >
      <div className="max-w-[460px] w-full bg-white/70 backdrop-blur-md border border-white/80 rounded-pill shadow-lg flex justify-around px-1.5 py-1.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-pill text-[10px] font-label flex-1 min-w-0 min-h-[44px] justify-center"
            >
              {active && (
                <motion.div
                  layoutId="nav-active-pill"
                  className="absolute inset-0 bg-gradient-to-b from-lavender to-pink rounded-pill -z-10"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <motion.span
                animate={{ scale: active ? 1.18 : 1, y: active ? -1 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                className="text-lg leading-none"
              >
                {tab.icon}
              </motion.span>
              <span className={active ? "text-plum font-semibold" : "text-plum-soft"}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
