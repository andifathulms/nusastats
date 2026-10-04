import type { Config } from "tailwindcss";

// Every colour is a CSS variable (RGB channels, defined in app/globals.css for
// light and `.dark`), so the whole app re-themes from one place and opacity
// modifiers like `bg-ink-accent/10` keep working.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Laut & Kertas": sea blue on cream paper, with kunyit (turmeric) as
        // the single warm highlight. Semantic tokens — use these in components.
        ink: {
          bg: v("ink-bg"),
          bg2: v("ink-bg2"),
          panel: v("ink-panel"),
          panel2: v("ink-panel2"),
          panel3: v("ink-panel3"),
          border: v("ink-border"),
          borderStrong: v("ink-border-strong"),
          text: v("ink-text"),
          muted: v("ink-muted"),
          faint: v("ink-faint"),
          accent: v("ink-accent"), // primary accent / links
          onAccent: v("ink-on-accent"), // text on a solid accent fill
          accent2: v("ink-accent2"), // kunyit — decorative marks/dots, never small text on cream
          warmText: v("ink-warm-text"), // kunyit dark enough for small text (eyebrows)
          good: v("ink-good"),
          warn: v("ink-warn"),
          bad: v("ink-bad"),
          gold: v("ink-gold"),
        },
        // Deep sea surface (hero bands, map panels, footer). Stays dark in both themes.
        coal: {
          bg: v("coal-bg"),
          bg2: v("coal-bg2"),
          hover: v("coal-hover"),
          border: v("coal-border"),
          text: v("coal-text"),
          muted: v("coal-muted"),
        },
        // Raw brand scales, for the few places that need a fixed step.
        laut: {
          50: "#F1F5FD",
          100: "#E3EBFA",
          200: "#CBDAF6",
          300: "#A3BEF0",
          400: "#6B96E6",
          500: "#3A72DB",
          600: "#2557BE",
          700: "#1C4596",
          800: "#163570",
          900: "#10264D",
          950: "#0A1A33",
        },
        kertas: {
          50: "#FFFDF8",
          100: "#FBF7EE",
          200: "#F3ECDD",
          300: "#E6DCC6",
          400: "#CDBF9F",
        },
        kunyit: { DEFAULT: "#D69A2D", light: "#E9B54A", ink: "#8A5A10" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "Iowan Old Style", "Georgia", "ui-serif", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, rgb(var(--brand-from)) 0%, rgb(var(--brand-to)) 100%)",
        // Kunyit→cream shimmer, for text clipped over dark sea surfaces.
        "brand-gradient-onDark": "linear-gradient(135deg, #E9B54A 0%, #FBF7EE 100%)",
        "brand-radial":
          "radial-gradient(ellipse 90% 65% at 50% -25%, rgb(var(--ink-accent) / 0.12), rgb(var(--ink-accent) / 0.04) 45%, transparent 75%), radial-gradient(ellipse 60% 45% at 95% -10%, rgb(214 154 45 / 0.12), transparent 70%)",
        "royal-weave":
          "repeating-linear-gradient(135deg, rgba(233,181,74,0.05) 0 1px, transparent 1px 14px), repeating-linear-gradient(45deg, rgba(233,181,74,0.04) 0 1px, transparent 1px 14px)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--ink-accent) / 0.18), 0 10px 24px -12px rgb(var(--brand-to) / 0.6)",
        panel: "var(--shadow-panel)",
        header: "var(--shadow-header)",
        tile: "var(--shadow-tile)",
        lift: "var(--shadow-lift)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
