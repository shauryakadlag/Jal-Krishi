import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#F5F6F2",
        palesage: "#DFE9E3",
        sage: "#A6BDB0",
        mutedblue: "#779AA0",
        forestteal: "#086B7B", // Updated to Deep Teal
        aqua: {
          50: "#F0FCFD",
          100: "#D8F6F8",
          200: "#B4EEF2",
          300: "#7DE2EA",
          400: "#3CD0DE",
          500: "#16B6C7",
          600: "#0E94A5",
          700: "#0E7685",
          800: "#125E6B",
          900: "#084D5E",
          950: "#032A36",
        },
        turquoise: {
          300: "#65EBDC",
          400: "#38E4D2",
          500: "#2EC4B6",
          600: "#1FA699",
          700: "#188278",
        },
        deepocean: {
          50: "#EBF6FA",
          100: "#CDE8F2",
          200: "#9FCDE3",
          500: "#1B7C9D",
          700: "#0C4E68",
          800: "#083B50",
          900: "#042736",
          950: "#021620",
        },
        soil: {
          50: "#F5F6F2",
          100: "#EBEDE7",
          200: "#D5DBD2",
          600: "#5C6862",
          800: "#2C3B37",
          900: "#1B2623",
        },
        leaf: {
          50: "#F2F6F3",
          100: "#DFE9E3",
          500: "#A6BDB0",
          600: "#148B9D",
          700: "#086B7B",
        },
        water: {
          50: "#EFF9FA",
          100: "#D8F4F6",
          500: "#16B6C7",
          600: "#0E94A5",
          700: "#086B7B",
        },
        amberwarn: {
          50: "#FDF8EE",
          100: "#F7EBD2",
          600: "#A86A14",
          700: "#7D4E0D",
        },
        risk: {
          50: "#FCF1F0",
          100: "#F7DBD8",
          600: "#B83B35",
          700: "#8F2A25",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "var(--font-devanagari)", "Noto Sans Devanagari", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
