"use client";

import { useState } from "react";
import { Panel, SectionTitle } from "@/components/ui";

// TikTok's photo-post fields: the title is capped at 90 characters, the
// description at 4,000 (we stay under 2,200 so it also fits Instagram).
export const TITLE_MAX = 90;
export const DESC_MAX = 2200;

/** Ready-to-paste TikTok title and description, each with a copy button. */
export function TikTokText({ title, description, hint }: { title: string; description: string; hint?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  const field = (key: string, label: string, text: string, max: number, rows?: boolean) => (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-ink-muted">
          {label}{" "}
          <span className={`font-mono font-normal ${text.length > max ? "text-ink-warmText" : "text-ink-faint"}`}>
            {text.length.toLocaleString("id-ID")}/{max.toLocaleString("id-ID")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => copy(key, text)}
          className="rounded-full border border-ink-border px-4 py-1 text-sm text-ink-text transition-colors hover:border-ink-accent hover:text-ink-accent"
        >
          {copied === key ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre
        className={`overflow-auto whitespace-pre-wrap rounded-lg bg-ink-panel2 p-4 font-sans text-sm leading-relaxed text-ink-text ${rows ? "max-h-[420px]" : ""}`}
      >
        {text}
      </pre>
    </div>
  );
  return (
    <Panel>
      <SectionTitle hint={hint ?? "tempel saat mengunggah ke TikTok"}>Judul & deskripsi TikTok</SectionTitle>
      <div className="space-y-4">
        {field("title", "Judul", title, TITLE_MAX)}
        {field("desc", "Deskripsi", description, DESC_MAX, true)}
      </div>
    </Panel>
  );
}
