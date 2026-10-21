"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AngkaCard } from "@/components/cards/AngkaCard";
import { ShareCard, TEMPLATES, type Template } from "@/components/cards/ShareCard";
import { WILAYAH_TEMPLATES, WilayahCard, type WilayahTemplate } from "@/components/cards/WilayahCard";
import { PROFIL_TEMPLATES, ProfilCard, type ProfilTemplate } from "@/components/cards/ProfilCards";
import { CaptionText } from "@/components/cards/CaptionText";
import { TEMAS, isTema } from "@/components/cards/brand";
import { setLightRamps } from "@/components/cards/geo";

// /card/{template}/{kode}[?debug=1] — a bare 1080×1920 share card for the PNG
// exporters (`npm run card`, `npm run carousel`). `debug=1` draws the TikTok UI
// zones, `tema=` the palette (brand.ts). `angka` is a carousel-data/1 pack on a map: kode = Kemendagri province
// scope or 00, the pack query (and focus=) in the search params. `caption` is the
// profile's TikTok title and description as text (cards= the slides exported).
function Card({ template, kode }: { template: string; kode: string }) {
  const params = useSearchParams();
  const debug = params.get("debug") === "1";
  // ?tema=malam|laut|kertas|putih (brand.ts). Light palettes flip the data ramps
  // before any card component computes a colour.
  const t = params.get("tema");
  const tema = isTema(t) ? t : "malam";
  setLightRamps(TEMAS[tema].light);
  if ((PROFIL_TEMPLATES as string[]).includes(template))
    return <ProfilCard template={template as ProfilTemplate} kode={kode} query={params} debug={debug} tema={tema} />;
  if ((WILAYAH_TEMPLATES as string[]).includes(template))
    return <WilayahCard template={template as WilayahTemplate} kode={kode} debug={debug} tema={tema} sorot={params.get("sorot") === "1"} />;
  if (template === "caption") {
    if (!/^\d{4}$/.test(kode)) return <div id="card" data-card-error={`kode kabupaten: ${kode}`} />;
    return <CaptionText kode={kode} query={params} />;
  }
  if (template === "angka") {
    if (!/^\d{2}$/.test(kode)) return <div id="card" data-card-error={`cakupan tidak dikenal: ${kode}`} />;
    return <AngkaCard scope={kode} query={params} debug={debug} tema={tema} />;
  }
  if (!TEMPLATES.includes(template as Template) || !/^\d{2}(\d{2}(\d{2})?)?$/.test(kode))
    return <div id="card" data-card-error={`template/kode tidak dikenal: ${template}/${kode}`} />;
  return <ShareCard template={template as Template} kode={kode} debug={debug} tema={tema} />;
}

export default function CardPage({ params }: { params: { template: string; kode: string } }) {
  return (
    <Suspense>
      <Card template={params.template} kode={params.kode} />
    </Suspense>
  );
}
