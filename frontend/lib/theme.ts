"use client";

import { useEffect, useState } from "react";

// Theme preference: an explicit light/dark choice, or follow the OS ("system").
// The `.dark` class on <html> is the single switch every token keys off.
export type ThemePref = "light" | "dark" | "system";
const KEY = "nusastats-theme";

/** Inline in <head> so the right theme paints first (no light flash in dark mode). */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    setPref(readPref());
    // Follow OS changes while on "system".
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readPref() === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const set = (p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {}
    apply(p);
    setPref(p);
  };
  return [pref, set];
}

/** True while the dark theme is active — for the few colours computed in JS (map ramps). */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
