// BPS province domain <-> Kemendagri (Dukcapil) province code.
//
// Outside Papua the two systems share 2-digit province prefixes (checked by
// name for all 32, 2026-10). Papua does not: every 9x prefix names a different
// province in each system, so a slice(0, 2) join draws Papua data on the wrong
// shape. BPS's data responses carry the 2022 provinces under 92/95/96/97
// (backend crawler/vervar_domains.py); Kemendagri numbers them 93-96.
//
//   BPS 9100 Papua Barat       -> Kemendagri 92
//   BPS 9200 Papua Barat Daya  -> Kemendagri 96
//   BPS 9400 Papua             -> Kemendagri 91
//   BPS 9500 Papua Selatan     -> Kemendagri 93
//   BPS 9600 Papua Tengah      -> Kemendagri 94
//   BPS 9700 Papua Pegunungan  -> Kemendagri 95
//
// Regencies never go through this: they use the name-based regency crosswalk
// (/api/dukcapil/regency-crosswalk/), since kabupaten numbers differ widely.
const BPS_TO_KEMENDAGRI: Record<string, string> = { "91": "92", "92": "96", "94": "91", "95": "93", "96": "94", "97": "95" };
const KEMENDAGRI_TO_BPS: Record<string, string> = Object.fromEntries(
  Object.entries(BPS_TO_KEMENDAGRI).map(([bps, kem]) => [kem, bps])
);

/** BPS province domain_id ("9500") or 2-digit prefix -> Kemendagri 2-digit code ("93"). */
export function bpsProvinceToKemendagri(bpsId: string): string {
  const p = bpsId.slice(0, 2);
  return BPS_TO_KEMENDAGRI[p] ?? p;
}

/** Kemendagri 2-digit province code ("93") -> BPS province domain_id ("9500"). */
export function kemendagriProvinceToBps(kemCode: string): string {
  return `${KEMENDAGRI_TO_BPS[kemCode] ?? kemCode}00`;
}
