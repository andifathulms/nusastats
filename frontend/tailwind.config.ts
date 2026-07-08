import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // App surface palette (slate-based, works with the dark shell).
        ink: {
          bg: "#0b1020",
          panel: "#141b2e",
          panel2: "#1b2540",
          border: "#26314f",
          text: "#e6ebf5",
          muted: "#9aa7c2",
          accent: "#5b8cff",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
