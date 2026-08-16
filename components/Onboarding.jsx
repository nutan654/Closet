"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Button from "./ui/Button";

const STEPS = [
  {
    emoji: "👗",
    title: "Add your pieces",
    body: "Snap a photo or pick a color for anything you own — clothes, shoes, skincare, makeup. Tap the + button in Wardrobe or Vanity to start.",
  },
  {
    emoji: "🪄",
    title: "Tap to equip a look",
    body: "Tap any card — or swipe right on the stack — to try it on your doll instantly. Swipe left to skip to the next piece.",
  },
  {
    emoji: "🪞",
    title: "Two rooms, one you",
    body: "Wardrobe holds clothes, shoes, bags & accessories. Vanity holds skincare, makeup, jewelry & fragrance. Switch rooms from the bar below.",
  },
  {
    emoji: "📦",
    title: "Save your favorite looks",
    body: "Once she's dressed the way you love, save it as an outfit from the Home screen — find every saved look again in Collections.",
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-plum/40 backdrop-blur-sm z-[400] flex items-center justify-center px-6"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="bg-cream w-full max-w-[380px] rounded-lg p-6 shadow-lg relative overflow-hidden"
      >
        <button
          onClick={onDone}
          className="absolute top-3 right-3 text-xs font-label font-semibold text-plum-soft px-2 py-1.5 hover:text-plum transition-colors"
        >
          Skip
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="text-center pt-5"
          >
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-b from-lavender to-pink grid place-items-center text-4xl mb-4 shadow-sm">
              {STEPS[step].emoji}
            </div>
            <h2 className="text-xl font-title text-plum mb-2">{STEPS[step].title}</h2>
            <p className="text-sm font-body text-plum-soft leading-relaxed px-1 min-h-[64px]">
              {STEPS[step].body}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center gap-1.5 my-6">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-pill transition-all duration-300 ${
                i === step ? "w-5 bg-plum" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="secondary" className="flex-1" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button variant="primary" className="flex-1" onClick={() => (last ? onDone() : setStep((s) => s + 1))}>
            {last ? "Let's begin ✨" : "Next"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
