/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // soft, low-saturation base — "expensive," not candy
        peach: { DEFAULT: "#FBDCC4", deep: "#F3C39F" },
        pink: { DEFAULT: "#F6D8E0", deep: "#EBB8C7" },
        cream: "#FFFDFB",
        sage: { DEFAULT: "#C7D6C3", deep: "#A9BFA4" },
        lavender: { DEFAULT: "#E7DEF2", deep: "#D4C5EA" },
        plum: { DEFAULT: "#5B3E4A", soft: "#93798A" },
        gold: { DEFAULT: "#D9B979", soft: "#EFE0BE" },
        line: "#EFE6E9",
        surface: "#FFFCFA",
      },
      fontFamily: {
        // Step 2 typography hierarchy
        title: ["var(--font-title)", "serif"],       // Playfair Display — main titles
        heading: ["var(--font-heading)", "serif"],    // Cormorant Garamond — section headings
        button: ["var(--font-button)", "sans-serif"], // Poppins SemiBold — buttons
        body: ["var(--font-body)", "sans-serif"],      // Inter — body copy
        label: ["var(--font-label)", "sans-serif"],    // DM Sans — small labels
        // kept for anything not yet migrated off the old names
        display: ["var(--font-title)", "serif"],
      },
      borderRadius: {
        sm: "12px",
        md: "18px",
        lg: "28px",
        pill: "999px",
      },
      boxShadow: {
        sm: "0 2px 10px rgba(91, 62, 74, 0.06)",
        md: "0 8px 24px rgba(91, 62, 74, 0.09)",
        lg: "0 16px 40px rgba(91, 62, 74, 0.12)",
        glow: "0 0 0 1px rgba(217, 185, 121, 0.25), 0 10px 30px rgba(91, 62, 74, 0.10)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
