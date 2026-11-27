import ScreenSkeleton from "@/app/components/skeletons/screen-skeleton";

/** Coming back from the form shows this, not a frozen form. */
export default function Loading() {
  return <ScreenSkeleton variant="detail" />;
}
