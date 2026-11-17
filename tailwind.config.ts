import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        soil: {
          50: "#faf6f0",
          100: "#f3eadc",
          200: "#e6d3b8",
          600: "#8c5a2b",
          800: "#543519",
          900: "#36210f",
        },
        leaf: {
          50: "#f1f8f3",
          100: "#dceee1",
          500: "#2e7d32",
          600: "#236327",
          700: "#1b4d1e",
        },
        water: {
          50: "#eef7fc",
          100: "#d6ecf8",
          500: "#0277bd",
          600: "#015c94",
        },
        amberwarn: {
          50: "#fff8e6",
          100: "#ffecb3",
          600: "#b26a00",
          700: "#8c5000",
        },
        risk: {
          50: "#fdecea",
          100: "#fad2cd",
          600: "#c62828",
          700: "#9e1c1c",
        },
      },
      fontFamily: {
        sans: ["var(--font-mukta)", "var(--font-noto-devanagari)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
