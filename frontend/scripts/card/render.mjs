// Peta Wilayah share-card exporter (docs/FEATURE-peta-wilayah.md §6.2).
//
//   npm run card -- --template terrain --kode 6409 [--kode 7316] [--debug]
//   npm run card -- --template landcover --level kabupaten --provinsi 64
//
// Renders /card/{template}/{kode} on the running frontend (default
// http://localhost:3010, override with --base) and saves the 1080x1920 #card
// element to exports/cards/{template}/{kode}.png (gitignored). A card whose page
// reports data-card-error (a failed guardrail, a missing image) is NOT saved;
// it is listed and the run exits non-zero. One-time setup:
//   cd scripts/card && npm ci && npx playwright install chromium
import { mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, "..", "..");
const PETA = join(FRONTEND, "public", "peta");
const OUT = join(FRONTEND, "..", "exports", "cards");
const TEMPLATES = { terrain: "terrain.json", landcover: "landcover.json" };
const LEVEL_LEN = { provinsi: 2, kabupaten: 4, kecamatan: 6 };

function parse(argv) {
  const a = { kode: [], base: "http://localhost:3010", debug: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--template") a.template = v();
    else if (k === "--kode") a.kode.push(v());
    else if (k === "--level") a.level = v();
    else if (k === "--provinsi") a.provinsi = v();
    else if (k === "--base") a.base = v();
    else if (k === "--debug") a.debug = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!TEMPLATES[a.template]) throw new Error(`--template must be one of ${Object.keys(TEMPLATES).join(", ")}`);
  if (!a.kode.length) {
    if (!LEVEL_LEN[a.level]) throw new Error("give --kode, or --level kabupaten|kecamatan [--provinsi NN]");
    a.kode = readdirSync(PETA)
      .filter((d) => d.length === LEVEL_LEN[a.level] && (!a.provinsi || d.startsWith(a.provinsi)))
      .filter((d) => existsSync(join(PETA, d, TEMPLATES[a.template])))
      .sort();
    if (!a.kode.length) throw new Error("no computed areas match that level/provinsi");
  }
  return a;
}

const args = parse(process.argv.slice(2));
const dir = join(OUT, args.template);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const failed = [];
let saved = 0;
for (const kode of args.kode) {
  const url = `${args.base}/card/${args.template}/${kode}${args.debug ? "?debug=1" : ""}`;
  try {
    await page.goto(url, { timeout: 120_000 });
    await page.waitForSelector("#card[data-card-ready], #card[data-card-error]", { timeout: 90_000 });
    const err = await page.getAttribute("#card", "data-card-error");
    if (err) {
      failed.push(`${kode}: ${err}`);
      continue;
    }
    const file = join(dir, `${kode}${args.debug ? ".debug" : ""}.png`);
    await page.locator("#card").screenshot({ path: file, animations: "disabled" });
    saved++;
    console.log(`card: ${args.template}/${kode} -> ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
  } catch (e) {
    failed.push(`${kode}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
console.log(`card: ${saved} saved, ${failed.length} not saved${failed.length ? ":\n  " + failed.join("\n  ") : ""}`);
process.exit(failed.length ? 1 : 0);
