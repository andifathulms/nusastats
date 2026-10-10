"use client";

import type { ReactNode } from "react";

export const W = 1080;
export const H = 1920;
// TikTok UI zones (spec §6.2) used by the share cards' debug outline.
export const SAFE = { top: 220, bottom: 420, right: 160 };
export const PAD = 64; // left margin
export const CONTENT_W = W - PAD - SAFE.right; // 856, the text column

/**
 * Zones for the 1080×1920 cards: one rule for text, a looser one for the map.
 *
 * TikTok draws its own UI over a photo carousel: the top bar (~130 px), the
 * like/comment/share column on the right (~140 px), and the username, caption,
 * music line and slide dots over the bottom ~420 px. Text must stay clear of
 * all of it. A map edge may run toward the icon column and still read, so the
 * map gets more width than the text:
 *
 *   text  x 64..920,  y 160..1500
 *   map   x 64..1016, y ..1500
 *   source line (22 px, also in the caption) at y 1514
 *
 * (Letting the map run below 1500 was tried: it collides with the source line.)
 */
export const ZONE = {
  wordmarkTop: 160,
  bodyTop: 232,
  textBottom: 1500,
  mapBottom: 1500,
  mapRight: W - PAD, // 1016
  sourceTop: 1514,
  infoW: 360, // the facts column when it sits beside the map
};
const FULL_W = ZONE.mapRight - PAD; // 952

export function CardHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  const size = title.length > 30 ? 84 : title.length > 22 ? 100 : 120;
  return (
    <div className="shrink-0" style={{ maxWidth: CONTENT_W }}>
      <div className="font-mono text-[28px] uppercase tracking-[0.1em] text-ink-gold">{kicker}</div>
      <h1 className="mt-3 font-display leading-[0.98]" style={{ fontSize: size }}>
        {title}
      </h1>
      {children}
    </div>
  );
}

/** Whether the map gets bigger with the facts beside it (tall shapes such as
 * Barru) or below it (wide shapes): compares the map width each layout allows
 * for this aspect ratio (height / width), from typical header and facts heights. */
export function sideBySide(aspect: number, headerH = 250, infoH = 380): boolean {
  return mapBoxFor(aspect, headerH, infoH).side;
}

/** The map box each layout gives (card px), and which one is chosen. Map labels
 * use it to stay 26-34 px on screen whatever the layout. */
export function mapBoxFor(aspect: number, headerH = 250, infoH = 380): { side: boolean; w: number; h: number } {
  const stack = { w: FULL_W, h: ZONE.textBottom - ZONE.bodyTop - headerH - infoH - 48 };
  const beside = { w: FULL_W - ZONE.infoW - 40, h: ZONE.mapBottom - ZONE.bodyTop - headerH - 24 };
  const width = (b: { w: number; h: number }) => Math.min(b.w, b.h / aspect);
  const side = width(beside) > width(stack) * 1.08;
  return { side, ...(side ? beside : stack) };
}

/**
 * The body of a map card. Stacked: header, map, facts (all above y 1500).
 * Side by side: header, then the facts on the LEFT (text stays away from the
 * icon column) and the map on the right, reaching down to y 1640.
 */
export function MapLayout({
  header,
  map,
  info,
  aspect,
  headerH,
  infoH,
  side: forced,
}: {
  header: ReactNode;
  map: ReactNode;
  info: ReactNode;
  aspect: number;
  headerH?: number;
  infoH?: number;
  side?: boolean;
}) {
  const side = forced ?? sideBySide(aspect, headerH, infoH);
  return (
    <div
      className="absolute flex flex-col"
      style={{ left: PAD, top: ZONE.bodyTop, width: FULL_W, height: (side ? ZONE.mapBottom : ZONE.textBottom) - ZONE.bodyTop }}
      data-layout={side ? "side" : "stack"}
    >
      {header}
      {side ? (
        <div className="mt-6 flex min-h-0 flex-1 gap-10">
          <div
            className="nm-info flex shrink-0 flex-col justify-end overflow-hidden"
            style={{ width: ZONE.infoW, paddingBottom: ZONE.mapBottom - ZONE.textBottom }}
          >
            {info}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">{map}</div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">{map}</div>
          <div className="nm-info shrink-0" style={{ maxWidth: CONTENT_W }}>
            {info}
          </div>
        </>
      )}
    </div>
  );
}

/** Debug overlay (?debug=1): the text and map zones, and an approximation of
 * TikTok's photo-carousel UI, to check what a viewer actually sees. */
export function TikTokOverlay() {
  const icon = (y: number, label: string) => (
    <g key={label}>
      <circle cx={1012} cy={y} r={38} fill="rgba(255,255,255,.9)" />
      <text x={1012} y={y + 70} textAnchor="middle" fontSize={24} fill="#fff" fontFamily="sans-serif">
        {label}
      </text>
    </g>
  );
  return (
    <svg className="pointer-events-none absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="tt-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
      </defs>
      <rect x={0} y={1420} width={W} height={500} fill="url(#tt-fade)" />
      <text x={540} y={110} textAnchor="middle" fontSize={34} fontWeight={700} fill="#fff" fontFamily="sans-serif">
        Mengikuti   Untuk Anda
      </text>
      {icon(1010, "")}
      {icon(1150, "12,3 rb")}
      {icon(1290, "214")}
      {icon(1430, "1.024")}
      {icon(1570, "Bagikan")}
      <g fill="#fff" fontFamily="sans-serif">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <circle key={i} cx={540 - 110 + i * 22} cy={1585} r={6} opacity={i === 0 ? 1 : 0.45} />
        ))}
        <text x={40} y={1660} fontSize={34} fontWeight={700}>@nusantaramapper</text>
        <text x={40} y={1712} fontSize={30}>Separuh warga Barru tinggal di 12% wilayahnya. Geser untuk</text>
        <text x={40} y={1752} fontSize={30}>peta medan, cahaya malam, dan dataran rendahnya… lainnya</text>
        <text x={40} y={1820} fontSize={28}>♫ suara asli - Nusantara Mapper</text>
      </g>
      <rect x={PAD} y={ZONE.wordmarkTop} width={920 - PAD} height={ZONE.textBottom - ZONE.wordmarkTop} fill="none" stroke="#22d3ee" strokeWidth={3} strokeDasharray="12 8" />
      <rect x={PAD} y={ZONE.bodyTop} width={ZONE.mapRight - PAD} height={ZONE.mapBottom - ZONE.bodyTop} fill="none" stroke="#f472b6" strokeWidth={3} strokeDasharray="4 8" />
    </svg>
  );
}
