// Carousel bundle exporter: one carousel-data/1 pack, its Peta Angka deck for
// Carousel Press, and the map cards that go between the deck's slides.
//
//   npm run carousel -- --source bps --metric 415 --level kabupaten --period 2025
//   npm run carousel -- --source dukcapil --metric sex_ratio --level kabupaten --prov 64 --recipe gap --bg landcover
//
// Pack options pass through to /api/carousel/deck/ (--prov --turvar --th --unit
// --label-metric --notes --top --bottom --allow-partial), plus --recipe
// top|terendah|gap and --bg terrain|landcover|none for the regions' map cards.
// Writes pack.json, provenance.json, map.json, deck.txt and README.md to
// exports/carousels/{id}/ (gitignored), then renders every map card from the
// running frontend into the same folder, named to sort next to the deck's
// {id}_{NN}.png slides. A card that reports data-card-error is NOT saved; it is
// listed and the run exits non-zero. A refused pack (422) prints the reason.
// Setup is shared with `npm run card`: cd scripts/card && npm ci && npx playwright install chromium
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "..", "exports", "carousels");
const PASS = ["source", "metric", "level", "period", "prov", "turvar", "th", "unit", "label-metric", "notes", "top", "bottom", "recipe", "bg"];

function parse(argv) {
  const a = { q: new URLSearchParams(), api: "http://localhost:8010", base: "http://localhost:3010", debug: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (k === "allow-partial") a.q.set("allow_partial", "1");
    else if (k === "debug") a.debug = true;
    else if (k === "api" || k === "base") a[k] = argv[++i];
    else if (PASS.includes(k)) a.q.set(k.replace("-", "_"), argv[++i]);
    else throw new Error(`unknown argument --${k}`);
  }
  for (const k of ["source", "metric", "level"]) if (!a.q.get(k)) throw new Error(`--${k} is required`);
  return a;
}

const args = parse(process.argv.slice(2));
const res = await fetch(`${args.api}/api/carousel/deck/?${args.q}`);
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`carousel: pack refused (${res.status}): ${body.error ?? "no reason given"}`);
  process.exit(1);
}

const dir = join(OUT, body.pack.id);
mkdirSync(dir, { recursive: true });
const json = (o) => JSON.stringify(o, null, 2) + "\n";
writeFileSync(join(dir, "pack.json"), json(body.pack));
writeFileSync(join(dir, "provenance.json"), json(body.provenance));
writeFileSync(join(dir, "map.json"), json(body.map));
writeFileSync(join(dir, "deck.txt"), body.deck);
writeFileSync(join(dir, "README.md"), body.readme);
writeFileSync(join(dir, "tiktok.txt"), `JUDUL\n${body.tiktok.title}\n\nDESKRIPSI\n${body.tiktok.description}\n`);
console.log(`carousel: ${body.pack.id}: deck + pack written to ${dir}`);
for (const w of body.warnings) console.log(`  ! ${w}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const failed = [];
let saved = 0;
for (const card of body.cards) {
  const url = `${args.base}${card.path}${args.debug ? "&debug=1" : ""}`;
  try {
    await page.goto(url, { timeout: 120_000 });
    await page.waitForSelector("#card[data-card-ready], #card[data-card-error]", { timeout: 90_000 });
    const err = await page.getAttribute("#card", "data-card-error");
    if (err) {
      failed.push(`${card.file}: ${err}`);
      continue;
    }
    const note = await page.getAttribute("#card", "data-card-note");
    const file = join(dir, card.file);
    await page.locator("#card").screenshot({ path: file, animations: "disabled" });
    saved++;
    console.log(`  card ${card.file} (${Math.round(statSync(file).size / 1024)} KB)${note ? ` — ${note}` : ""}`);
  } catch (e) {
    failed.push(`${card.file}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
console.log(`carousel: ${saved} map card(s) saved, ${failed.length} not saved${failed.length ? ":\n  " + failed.join("\n  ") : ""}`);
writeFileSync(join(dir, "carousel-press.url"), `[InternetShortcut]\nURL=${body.carousel_press_url}\n`);
console.log(`next: open carousel-press.url (or paste deck.txt into Carousel Press), unzip its PNGs into ${dir}.`);
process.exit(failed.length ? 1 : 0);
