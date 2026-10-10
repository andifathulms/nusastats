"use client";

import { useEffect, useState } from "react";
import { profilCaption, type ProfilCaption } from "./caption";

/** /card/caption/{kab}[?indicator=…&cards=a,b]: the profile's TikTok text, for
 * the cards service to put in the ZIP. Same ready/error contract as a card. */
export function CaptionText({ kode, query }: { kode: string; query: URLSearchParams }) {
  const [c, setC] = useState<ProfilCaption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const indicator = query.get("indicator") ?? "median_age";
  const cards = query.get("cards");
  useEffect(() => {
    profilCaption(kode, indicator, cards ? cards.split(",") : undefined)
      .then(setC)
      .catch((e) => setError(String(e.message ?? e)));
  }, [kode, indicator, cards]);
  return (
    <div id="card" data-card-ready={c ? "1" : undefined} data-card-error={error ?? undefined} className="p-8 font-mono text-sm">
      {c && (
        <>
          <pre id="caption-title" className="whitespace-pre-wrap">{c.title}</pre>
          <hr className="my-4" />
          <pre id="caption-description" className="whitespace-pre-wrap">{c.description}</pre>
        </>
      )}
      {error}
    </div>
  );
}
