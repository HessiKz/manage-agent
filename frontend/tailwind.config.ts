import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Vazirmatn", "ui-sans-serif", "system-ui"],
      },
      colors: {
        brand: {
          50:  "#fdf8f0",
          100: "#f8e8d0",
          200: "#e8c8a8",
          300: "#d8a070",
          400: "#c88848",
          500: "#b86828",
          600: "#9a5520",
          700: "#7c4318",
          800: "#5e3212",
          900: "#40220c",
          950: "#251208",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#fbfaf6",
          border: "#e8e0d8",
        },
        sidebar: {
          DEFAULT: "#131419",
          hover: "#1e1f26",
          active: "#282930",
        },
        accent: {
          green: "#188858",
          blue: "#2868a0",
          "blue-light": "#5890d0",
          purple: "#7858a0",
          pink: "#c05878",
          red: "#b03838",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(64,34,12,0.06), 0 8px 24px rgba(64,34,12,0.06)",
        glow: "0 0 0 1px rgba(184,104,40,0.15), 0 8px 32px rgba(184,104,40,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
