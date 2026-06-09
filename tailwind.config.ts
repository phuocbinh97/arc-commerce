import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg:      "#0d1117",
        surface: "#161b22",
        surface2:"#1c2330",
        border:  "rgba(255,255,255,0.08)",
        ink:     "#e6edf3",
        muted:   "#7d8590",
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
