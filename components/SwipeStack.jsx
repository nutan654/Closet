"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CATEGORY_DEFS } from "@/lib/constants";

/**
 * items: array of item objects for the active category
 * onWear(item): called when the user swipes right (or taps Wear)
 * onSkip(item): called when the user swipes left (or taps Skip)
 */
export default function SwipeStack({ items, onWear, onSkip }) {
  const [index, setIndex] = useState(0);
  const current = items[index];
  const dragThreshold = 100;

  function advance() {
    setIndex((i) => Math.min(i + 1, items.length));
  }

  function handleDragEnd(_, info) {
    if (info.offset.x > dragThreshold) {
      onWear?.(current);
      advance();
    } else if (info.offset.x < -dragThreshold) {
      onSkip?.(current);
      advance();
    }
  }

  if (!items.length) {
    return (
      <div className="text-center py-10 text-plum-soft">
        <span className="text-3xl block mb-2">🪄</span>
        Nothing in this category yet.
      </div>
    );
  }

  if (index >= items.length) {
    return (
      <div className="text-center py-10 text-plum-soft">
        <span className="text-3xl block mb-2">✨</span>
        You&apos;ve been through all of them.
        <button
          onClick={() => setIndex(0)}
          className="block mx-auto mt-3 text-sm font-bold text-plum underline"
        >
          Start over
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-72 flex items-center justify-center">
      <AnimatePresence>
        {items.slice(index, index + 3).reverse().map((item, stackI) => {
          const isTop = stackI === Math.min(2, items.length - index - 1);
          return (
            <motion.div
              key={item.id}
              className="absolute w-48 rounded-lg bg-white shadow-md p-4 cursor-grab active:cursor-grabbing"
              style={{ zIndex: stackI }}
              initial={{ scale: 0.9, y: 10, opacity: 0 }}
              animate={{ scale: 1 - (2 - stackI) * 0.04, y: (2 - stackI) * 8, opacity: 1 }}
              exit={{ x: 0, opacity: 0 }}
              drag={isTop ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={isTop ? handleDragEnd : undefined}
              whileDrag={{ rotate: 8 }}
            >
              <div
                className="w-full aspect-square rounded-md grid place-items-center text-4xl mb-2"
                style={{ background: `${item.color}33` }}
              >
                {item.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo} alt="" className="w-full h-full object-cover rounded-md" />
                ) : (
                  CATEGORY_DEFS[item.category]?.emoji
                )}
              </div>
              <div className="font-bold text-sm truncate">{item.name}</div>
              <div className="text-xs text-plum-soft truncate">{item.brand}</div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div className="absolute -bottom-2 flex gap-6">
        <button
          onClick={() => { onSkip?.(current); advance(); }}
          className="w-12 h-12 rounded-full bg-white shadow-sm grid place-items-center text-xl"
          aria-label="Skip"
        >
          ✕
        </button>
        <button
          onClick={() => { onWear?.(current); advance(); }}
          className="w-12 h-12 rounded-full bg-plum text-cream shadow-sm grid place-items-center text-xl"
          aria-label="Wear"
        >
          ♥
        </button>
      </div>
    </div>
  );
}
