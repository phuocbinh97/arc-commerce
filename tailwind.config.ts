import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg:      "var(--color-bg)",
        surface: "var(--color-surface)",
        surface2:"var(--color-surface2)",
        ink:     "var(--color-ink)",
        muted:   "var(--color-muted)",
        accent:  "#0757f9",
        green:   "#3fb950",
        amber:   "#d29922",
        red:     "#f85149",
        purple:  "#a371f7",
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui"],
        mono: ["DM Mono", "ui-monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
