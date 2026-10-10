// The `cards` service (docker-compose): renders cards to PNG with the same
// headless Chromium as `npm run card`, for the /carousel page's downloads.
//
//   GET /health
//   GET /png?template=terrain&kode=7311[&indicator=pct_elderly]  -> image/png, or 422 {error}
//   GET /zip?kode=7311[&indicator=…][&templates=wilayah,terrain] -> {kode}-profil.zip
//
// The zip holds {NN}_{template}.png in posting order plus TIDAK-DIBUAT.txt
// listing any card that reported data-card-error, with the reason.
// In Docker the card pages are loaded from CARD_BASE (http://frontend:3000) and
// their API calls to API_PUBLIC (http://localhost:8010, the URL baked into the
// frontend) are forwarded to API_INTERNAL (http://web:8000).
import http from "node:http";
import { PROFIL, TEMPLATES, cardUrl, openPage, shoot } from "./shoot.mjs";
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

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const kode = u.searchParams.get("kode") ?? "";
    const indicator = u.searchParams.get("indicator") ?? undefined;
    if (u.pathname === "/health") return json(res, 200, { ok: true, base: BASE });
    if (!/^\d{4}$/.test(kode)) return json(res, 400, { error: "kode: 4-digit Kemendagri kabupaten code" });
    if (indicator && !/^[a-z_]+$/.test(indicator)) return json(res, 400, { error: "indicator" });

    if (u.pathname === "/png") {
      const t = u.searchParams.get("template") ?? "";
      if (!TEMPLATES[t]) return json(res, 400, { error: `template: ${Object.keys(TEMPLATES).join(", ")}` });
      const r = await serial(() => shoot(page, cardUrl(BASE, t, kode, { indicator })));
      if (r.error) return json(res, 422, { error: r.error });
      return send(res, 200, "image/png", r.png, { "content-disposition": `attachment; filename="${kode}_${t}.png"` });
    }

    if (u.pathname === "/zip") {
      const wanted = (u.searchParams.get("templates") ?? PROFIL.join(",")).split(",").filter((t) => PROFIL.includes(t));
      const files = [];
      const skipped = [];
      for (const t of PROFIL.filter((x) => wanted.includes(x))) {
        const r = await serial(() => shoot(page, cardUrl(BASE, t, kode, { indicator })));
        if (r.error) skipped.push(`${t}: ${r.error}`);
        else files.push({ name: `${String(files.length + 1).padStart(2, "0")}_${t}.png`, data: r.png });
      }
      if (skipped.length) files.push({ name: "TIDAK-DIBUAT.txt", data: Buffer.from(skipped.join("\n") + "\n", "utf8") });
      if (!files.length) return json(res, 422, { error: "tidak ada kartu yang bisa dibuat" });
      return send(res, 200, "application/zip", zip(files), {
        "content-disposition": `attachment; filename="${kode}-profil.zip"`,
        "x-cards-skipped": String(skipped.length),
      });
    }
    json(res, 404, { error: "GET /health, /png, /zip" });
  })
  .listen(PORT, () => console.log(`cards: http://0.0.0.0:${PORT} (cards from ${BASE})`));
