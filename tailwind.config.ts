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
        forestteal: "#385A54",
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
          600: "#4A7068",
          700: "#385A54",
        },
        water: {
          50: "#EFF4F5",
          100: "#DCE7E9",
          500: "#779AA0",
          600: "#53767C",
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
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Noto Sans Devanagari", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
