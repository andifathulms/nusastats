import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Royal" palette — deep royal navy blue + warm royal gold, on a pale blue-tinted
        // white page. Gold is decorative only (dots/bars/dark surfaces), never text on white.
        ink: {
          bg: "#F4F6FB",
          bg2: "#E9EDF6",
          panel: "#FFFFFF",
          panel2: "#EEF2F9",
          panel3: "#E4EAF4",
          border: "#DBE1EE",
          borderStrong: "#AEB9D2",
          text: "#0D1B36",
          muted: "#5B6B8A",
          faint: "#93A0BC",
          accent: "#1E4585", // royal navy blue — primary accent / links
          accent2: "#C49A48", // royal gold — decorative bars/dots only (not text on white)
          good: "#15803D",
          warn: "#B45309",
          bad: "#DC2626",
          gold: "#D4B36A", // brighter gold for dark surfaces / clip-text
        },
        // Topbar & hero surface — deep royal navy.
        // (Token name "coal" is historical; the hue is royal navy.)
        coal: {
          bg: "#0F2340",
          bg2: "#17315A",
          hover: "#21426F",
          border: "#2C4E80",
          text: "#F1F5FF",
          muted: "#AEC0E2",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "ui-serif", "serif"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #2A5AA0 0%, #15335F 100%)",
        // Gold→cream shimmer — for text clipped over the dark topbar/hero, where a royal-blue
        // gradient would blend into the navy background and disappear.
        "brand-gradient-onDark": "linear-gradient(135deg, #E7C97E 0%, #FFF7E6 100%)",
        "brand-radial":
          "radial-gradient(ellipse 90% 65% at 50% -25%, rgba(30,69,133,0.16), rgba(30,69,133,0.05) 45%, transparent 75%), radial-gradient(ellipse 60% 45% at 95% -10%, rgba(196,154,72,0.13), transparent 70%)",
        // Subtle woven texture for dark surfaces (topbar/hero) — faint gold threads.
        "royal-weave":
          "repeating-linear-gradient(135deg, rgba(212,179,106,0.05) 0 1px, transparent 1px 14px), repeating-linear-gradient(45deg, rgba(212,179,106,0.04) 0 1px, transparent 1px 14px)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(30,69,133,0.18), 0 10px 30px -12px rgba(30,69,133,0.45)",
        panel: "0 1px 0 0 rgba(255,255,255,0.7) inset, 0 12px 32px -20px rgba(13,27,54,0.22)",
        header: "0 1px 2px 0 rgba(13,27,54,0.08), 0 6px 20px -12px rgba(13,27,54,0.25)",
        tile: "0 1px 0 0 rgba(255,255,255,0.8) inset, 0 6px 18px -14px rgba(13,27,54,0.30)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
