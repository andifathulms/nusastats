import { Suspense } from "react";
import { SorotanIndex } from "@/components/sorotan/SorotanIndex";

export const metadata = { title: "Sorotan — NusaStats" };

export default function SorotanPage() {
  // Suspense: the index reads its filters from the URL (useSearchParams).
  return (
    <Suspense>
      <SorotanIndex />
    </Suspense>
  );
}
