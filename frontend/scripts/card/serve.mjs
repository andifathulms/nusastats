// The `cards` service (docker-compose): renders cards to PNG with the same
// headless Chromium as `npm run card`, for the /carousel page's downloads.
//
//   GET /health
//   GET /png?template=terrain&kode=7311[&indicator=pct_elderly]  -> image/png, or 422 {error}
//   GET /zip?kode=7311[&indicator=…][&templates=wilayah,terrain] -> {kode}-profil.zip
//   GET /deck-zip?<the /api/carousel/deck/ query>                -> {pack id}.zip
//   GET /shot?path=/card/angka/…[&name=x.png]                     -> one card as image/png
// Every route takes `tema=malam|laut|kertas|putih` (the card palette, brand.ts).
//
// The zip holds {NN}_{template}.png in posting order, 00_judul-dan-deskripsi.txt
// (the TikTok title and description for the slides it holds), and
// TIDAK-DIBUAT.txt listing any card that reported data-card-error, with the reason.
// The deck zip is a ranking's map cards, named to sit between the Carousel Press
// slides, plus deck.txt, tiktok.txt, README.md, pack.json, provenance.json and
// carousel-press.url (the text slides themselves come from Carousel Press).
// In Docker the card pages are loaded from CARD_BASE (http://frontend:3000) and
// their API calls to API_PUBLIC (http://localhost:8010, the URL baked into the
// frontend) are forwarded to API_INTERNAL (http://web:8000).
import http from "node:http";
import { PROFIL, TEMPLATES, caption, cardUrl, openPage, shoot } from "./shoot.mjs";
import { zip } from "./zip.mjs";

const PORT = Number(process.env.PORT || 3012);
const BASE = process.env.CARD_BASE || "http://localhost:3010";
const API_PUBLIC = process.env.API_PUBLIC;
const API_INTERNAL = process.env.API_INTERNAL;

const { page } = await openPage();
if (API_PUBLIC && API_INTERNAL) {
  const host = new URL(API_PUBLIC).host;
  await page.route(`${API_PUBLIC}/**`, async (route) => {
    const req = route.request();
    const resp = await route.fetch({ url: req.url().replace(API_PUBLIC, API_INTERNAL), headers: { ...req.headers(), host } });
    await route.fulfill({ response: resp, headers: { ...resp.headers(), "access-control-allow-origin": "*" } });
  });
}

// One page, one card at a time.
let chain = Promise.resolve();
const serial = (fn) => {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
};

const send = (res, status, type, body, extra = {}) => {
  res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", ...extra });
  res.end(body);
};
const json = (res, status, obj) => send(res, status, "application/json", JSON.stringify(obj));

// The deck, from the API as the browser sees it (same Host header as the page route).
function getDeck(query) {
  const url = new URL(`/api/carousel/deck/?${query}`, API_INTERNAL || API_PUBLIC || "http://localhost:8010");
  const headers = API_PUBLIC ? { host: new URL(API_PUBLIC).host } : {};
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return reject(new Error(`API deck -> ${r.statusCode}`));
          }
          if (r.statusCode !== 200) return reject(new Error(body.error ?? `API deck -> ${r.statusCode}`));
          resolve(body);
        });
      })
      .on("error", reject);
  });
}
const TEMAS = ["malam", "laut", "kertas", "putih"];
// Only card pages are rendered from a path.
const cardPath = (p) => typeof p === "string" && /^\/card\/[a-z]+\/\d+(\?[^#\s]*)?$/.test(p);

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const kode = u.searchParams.get("kode") ?? "";
    const indicator = u.searchParams.get("indicator") ?? undefined;
    if (u.pathname === "/health") return json(res, 200, { ok: true, base: BASE });
    const tema = u.searchParams.get("tema") ?? "malam";
    if (!TEMAS.includes(tema)) return json(res, 400, { error: `tema: ${TEMAS.join(", ")}` });
    u.searchParams.delete("tema");
    const withTema = (path) => (tema === "malam" ? path : `${path}${path.includes("?") ? "&" : "?"}tema=${tema}`);

    if (u.pathname === "/shot") {
      const path = u.searchParams.get("path");
      if (!cardPath(path)) return json(res, 400, { error: "path: /card/{template}/{kode}?…" });
      const r = await serial(() => shoot(page, `${BASE}${path}`));
      if (r.error) return json(res, 422, { error: r.error });
      const name = (u.searchParams.get("name") ?? "kartu.png").replace(/[^\w.-]/g, "_");
      return send(res, 200, "image/png", r.png, { "content-disposition": `attachment; filename="${name}"` });
    }

    if (u.pathname === "/deck-zip") {
      let deck;
      try {
        deck = await getDeck(u.searchParams.toString());
      } catch (e) {
        return json(res, 422, { error: e.message });
      }
      const files = [];
      const skipped = [];
      for (const c of deck.cards) {
        if (!cardPath(c.path)) {
          skipped.push(`${c.file}: bukan halaman kartu`);
          continue;
        }
        const r = await serial(() => shoot(page, `${BASE}${withTema(c.path)}`));
        if (r.error) skipped.push(`${c.file}: ${r.error}`);
        else files.push({ name: c.file, data: r.png });
      }
      if (!files.length) return json(res, 422, { error: `tidak ada kartu yang bisa dibuat${skipped.length ? `: ${skipped[0]}` : ""}` });
      const text = (name, body) => files.push({ name, data: Buffer.from(body, "utf8") });
      text("deck.txt", deck.deck);
      text("tiktok.txt", `JUDUL\n${deck.tiktok.title}\n\nDESKRIPSI\n${deck.tiktok.description}\n`);
      text("README.md", deck.readme);
      text("pack.json", JSON.stringify(deck.pack, null, 2) + "\n");
      text("provenance.json", JSON.stringify(deck.provenance, null, 2) + "\n");
      text("carousel-press.url", `[InternetShortcut]\nURL=${deck.carousel_press_url}\n`);
      if (skipped.length) text("TIDAK-DIBUAT.txt", skipped.join("\n") + "\n");
      return send(res, 200, "application/zip", zip(files), {
        "content-disposition": `attachment; filename="${deck.pack.id}.zip"`,
        "x-cards-skipped": String(skipped.length),
        "access-control-expose-headers": "x-cards-skipped",
      });
    }
    if (!/^\d{4}$/.test(kode)) return json(res, 400, { error: "kode: 4-digit Kemendagri kabupaten code" });
    if (indicator && !/^[a-z_]+$/.test(indicator)) return json(res, 400, { error: "indicator" });

    if (u.pathname === "/png") {
      const t = u.searchParams.get("template") ?? "";
      if (!TEMPLATES[t]) return json(res, 400, { error: `template: ${Object.keys(TEMPLATES).join(", ")}` });
      const panel = Math.max(1, Number(u.searchParams.get("panel")) || 1);
      const r = await serial(() => shoot(page, cardUrl(BASE, t, kode, { indicator, tema, panel })));
      if (r.error) return json(res, 422, { error: r.error });
      return send(res, 200, "image/png", r.png, {
        "content-disposition": `attachment; filename="${kode}_${t}${panel > 1 || r.panels > 1 ? `-${panel}` : ""}.png"`,
      });
    }

    if (u.pathname === "/zip") {
      const wanted = (u.searchParams.get("templates") ?? PROFIL.join(",")).split(",").filter((t) => PROFIL.includes(t));
      const files = [];
      const skipped = [];
      const made = [];
      for (const t of PROFIL.filter((x) => wanted.includes(x))) {
        const r = await serial(() => shoot(page, cardUrl(BASE, t, kode, { indicator, tema })));
        if (r.error) skipped.push(`${t}: ${r.error}`);
        else {
          made.push(t);
          const multi = r.panels > 1;
          files.push({ name: `${String(files.length + 1).padStart(2, "0")}_${t}${multi ? "-1" : ""}.png`, data: r.png });
          // The rest of a panorama: one slide each, right after the first.
          for (let p = 2; p <= r.panels; p++) {
            const rp = await serial(() => shoot(page, cardUrl(BASE, t, kode, { indicator, tema, panel: p })));
            if (rp.error) skipped.push(`${t} ${p}/${r.panels}: ${rp.error}`);
            else {
              made.push(t);
              files.push({ name: `${String(files.length + 1).padStart(2, "0")}_${t}-${p}.png`, data: rp.png });
            }
          }
        }
      }
      if (made.length) {
        const q = new URLSearchParams({ cards: made.join(","), ...(indicator ? { indicator } : {}) });
        const c = await serial(() => caption(page, `${BASE}/card/caption/${kode}?${q}`));
        if (c.error) skipped.push(`judul & deskripsi TikTok: ${c.error}`);
        else files.unshift({ name: "00_judul-dan-deskripsi.txt", data: Buffer.from(`JUDUL\n${c.title}\n\nDESKRIPSI\n${c.description}\n`, "utf8") });
      }
      if (skipped.length) files.push({ name: "TIDAK-DIBUAT.txt", data: Buffer.from(skipped.join("\n") + "\n", "utf8") });
      if (!files.length) return json(res, 422, { error: "tidak ada kartu yang bisa dibuat" });
      return send(res, 200, "application/zip", zip(files), {
        "content-disposition": `attachment; filename="${kode}-profil.zip"`,
        "x-cards-skipped": String(skipped.length),
        "access-control-expose-headers": "x-cards-skipped",
      });
    }
    json(res, 404, { error: "GET /health, /png, /zip, /shot, /deck-zip" });
  })
  .listen(PORT, () => console.log(`cards: http://0.0.0.0:${PORT} (cards from ${BASE})`));
