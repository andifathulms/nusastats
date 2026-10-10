// Peta Wilayah share-card exporter (docs/FEATURE-peta-wilayah.md §6.2).
//
//   npm run card -- --template terrain --kode 6409 [--kode 7316] [--debug]
//   npm run card -- --template landcover --level kabupaten --provinsi 64
//   npm run card -- --template profil --kode 6409    # every card for one kabupaten
//
// Templates: terrain, landcover, nightlights, lowland, relief (Peta layers),
// wilayah (kecamatan map with names), kepadatan (population density per desa),
// cahaya (residents vs night lights), rendah (residents of desa mostly < 10 m),
// kecamatan (a Dukcapil ratio per kecamatan; --indicator, default median_age).
// `profil` renders all of them in posting order into
// exports/cards/profil/{kode}/{NN}_{template}.png; a template whose data isn't
// there for an area is reported, not saved.
//
// Renders /card/{template}/{kode} on the running frontend (default
// http://localhost:3010, override with --base) and saves the 1080x1920 #card
// element to exports/cards/{template}/{kode}.png (gitignored). A card whose page
// reports data-card-error (a failed guardrail, a missing image) is NOT saved;
// it is listed and the run exits non-zero. One-time setup:
//   cd scripts/card && npm ci && npx playwright install chromium
import { mkdirSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROFIL, TEMPLATES, cardUrl, openPage, shoot } from "./shoot.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, "..", "..");
const PETA = join(FRONTEND, "public", "peta");
const OUT = join(FRONTEND, "..", "exports", "cards");
const LEVEL_LEN = { provinsi: 2, kabupaten: 4, kecamatan: 6 };

function parse(argv) {
  const a = { kode: [], base: "http://localhost:3010", debug: false, indicator: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--template") a.template = v();
    else if (k === "--kode") a.kode.push(v());
    else if (k === "--level") a.level = v();
    else if (k === "--provinsi") a.provinsi = v();
    else if (k === "--base") a.base = v();
    else if (k === "--debug") a.debug = true;
    else if (k === "--indicator") a.indicator = v();
    else throw new Error(`unknown argument ${k}`);
  }
  if (!TEMPLATES[a.template] && a.template !== "profil")
    throw new Error(`--template must be one of ${[...Object.keys(TEMPLATES), "profil"].join(", ")}`);
  if (!a.kode.length) {
    if (!LEVEL_LEN[a.level]) throw new Error("give --kode, or --level kabupaten|kecamatan [--provinsi NN]");
    a.kode = readdirSync(PETA)
      .filter((d) => d.length === LEVEL_LEN[a.level] && (!a.provinsi || d.startsWith(a.provinsi)))
      .filter((d) => existsSync(join(PETA, d, TEMPLATES[a.template] ?? "bounds.json")))
      .sort();
    if (!a.kode.length) throw new Error("no computed areas match that level/provinsi");
  }
  return a;
}

const args = parse(process.argv.slice(2));
// One job per (template, kode); `profil` expands to every template, numbered in posting order.
const jobs = args.kode.flatMap((kode) =>
  args.template === "profil"
    ? PROFIL.map((t, i) => ({ t, kode, file: join(OUT, "profil", kode, `${String(i + 1).padStart(2, "0")}_${t}`) }))
    : [{ t: args.template, kode, file: join(OUT, args.template, kode) }]
);

const { browser, page } = await openPage();
const failed = [];
let saved = 0;
for (const { t, kode, file: base } of jobs) {
  const r = await shoot(page, cardUrl(args.base, t, kode, { indicator: args.indicator, debug: args.debug }));
  if (r.error) {
    failed.push(`${t}/${kode}: ${r.error}`);
    continue;
  }
  const file = `${base}${args.debug ? ".debug" : ""}.png`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, r.png);
  saved++;
  console.log(`card: ${t}/${kode} -> ${file} (${Math.round(statSync(file).size / 1024)} KB)${r.note ? ` — ${r.note}` : ""}`);
}
await browser.close();
console.log(`card: ${saved} saved, ${failed.length} not saved${failed.length ? ":\n  " + failed.join("\n  ") : ""}`);
process.exit(failed.length ? 1 : 0);
