"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShareCard, TEMPLATES, type Template } from "@/components/cards/ShareCard";

// /card/{template}/{kode}[?debug=1] — a bare 1080×1920 share card for the PNG
// exporter (`npm run card`). `debug=1` draws the TikTok UI zones.
function Card({ template, kode }: { template: string; kode: string }) {
  const debug = useSearchParams().get("debug") === "1";
  if (!TEMPLATES.includes(template as Template) || !/^\d{2}(\d{2}(\d{2})?)?$/.test(kode))
    return <div id="card" data-card-error={`template/kode tidak dikenal: ${template}/${kode}`} />;
  return <ShareCard template={template as Template} kode={kode} debug={debug} />;
}

export default function CardPage({ params }: { params: { template: string; kode: string } }) {
  return (
    <Suspense>
      <Card template={params.template} kode={params.kode} />
    </Suspense>
  );
}
