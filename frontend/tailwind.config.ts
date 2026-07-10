import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Content surface — from the "Coastal Ledger" palette (colorhunt.co/palette/0a2947f3e4c9d3d4c08b5e3c),
        // lightened and cooled toward a pale cream-blue page so it reads airier. White panels for pop.
        ink: {
          bg: "#eaeceb",
          bg2: "#e1e3e2",
          panel: "#ffffff",
          panel2: "#edeee6",
          panel3: "#e0e1d3",
          border: "#c9cbca",
          borderStrong: "#a4a5a5",
          text: "#051220",
          muted: "#544c40",
          faint: "#98998a",
          accent: "#8b5e3c",
          accent2: "#0a2947",
          good: "#1f7a45",
          warn: "#a6650a",
          bad: "#b23a3a",
        },
        // Sidebar surface — the palette's deep navy, deliberately dark for contrast against the cream content area.
        coal: {
          bg: "#0a2947",
          bg2: "#193652",
          hover: "#2c4761",
          border: "#455c73",
          text: "#f3e4c9",
          muted: "#e0dac4",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #8b5e3c 0%, #0a2947 100%)",
        // Same brand hues, lightened — for text clipped over the dark sidebar, where the dark end
        // of `brand-gradient` would blend into the navy background and disappear.
        "brand-gradient-onDark": "linear-gradient(135deg, #d9b78a 0%, #f3e4c9 100%)",
        "brand-radial":
          "radial-gradient(ellipse 90% 65% at 50% -25%, rgba(139,94,60,0.16), rgba(139,94,60,0.05) 45%, transparent 75%), radial-gradient(ellipse 60% 45% at 95% -10%, rgba(10,41,71,0.12), transparent 70%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,94,60,0.2), 0 8px 24px -10px rgba(139,94,60,0.4)",
        panel: "0 1px 0 0 rgba(255,255,255,0.6) inset, 0 8px 24px -16px rgba(5,18,32,0.18)",
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
