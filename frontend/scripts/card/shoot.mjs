// Shared by render.mjs (CLI) and serve.mjs (the `cards` service): one headless
// Chromium page that loads /card/{template}/{kode} and screenshots #card once it
// reports data-card-ready. A card that reports data-card-error is not captured.
import { chromium } from "playwright";

// Template -> the Peta file an area needs before it can be listed for a batch.
export const TEMPLATES = {
  terrain: "terrain.json", landcover: "landcover.json", nightlights: "nightlights.json",
  lowland: "terrain.json", relief: "terrain.json", wilayah: "bounds.json", kepadatan: "bounds.json",
  cahaya: "desa.json", rendah: "desa.json", kecamatan: "bounds.json", penutup: "bounds.json",
};
// A kabupaten profile, in posting order: the hook first, the question last, and
// each raster layer right before the card that weighs it by population
// (lowland -> rendah, nightlights -> cahaya).
export const PROFIL = ["kepadatan", "wilayah", "terrain", "relief", "lowland", "rendah", "landcover", "nightlights", "cahaya", "kecamatan", "penutup"];

export function cardUrl(base, template, kode, { indicator, debug } = {}) {
  const q = new URLSearchParams();
  if (template === "kecamatan" && indicator) q.set("indicator", indicator);
  if (debug) q.set("debug", "1");
  return `${base}/card/${template}/${kode}${q.size ? `?${q}` : ""}`;
}

export async function openPage() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  return { browser, page };
}

/** { png, note } for a ready card, or { error } (a guardrail or a load failure). */
export async function shoot(page, url) {
  try {
    await page.goto(url, { timeout: 120_000 });
    await page.waitForSelector("#card[data-card-ready], #card[data-card-error]", { timeout: 90_000 });
    const error = await page.getAttribute("#card", "data-card-error");
    if (error) return { error };
    const note = await page.getAttribute("#card", "data-card-note");
    const png = await page.locator("#card").screenshot({ animations: "disabled" });
    return { png, note };
  } catch (e) {
    return { error: e.message.split("\n")[0] };
  }
}
