import SectorReservationSkeleton from "@/app/components/festivals/reservations/sector-reservation-skeleton";

// The page's own fallback, so the tap and the page's Suspense show one
// skeleton instead of two in a row.
export default function Loading() {
  return <SectorReservationSkeleton />;
}
