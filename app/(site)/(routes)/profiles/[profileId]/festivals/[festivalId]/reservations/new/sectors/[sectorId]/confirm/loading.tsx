import HoldConfirmationSkeleton from "@/app/components/pages/profiles/festivals/hold-confirmation-skeleton";

// The page's own fallback, so the tap and the page's Suspense show one
// skeleton instead of two in a row.
export default function Loading() {
  return <HoldConfirmationSkeleton />;
}
