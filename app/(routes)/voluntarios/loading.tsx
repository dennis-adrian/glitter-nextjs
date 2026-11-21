import ScreenSkeleton from "@/app/components/skeletons/screen-skeleton";

/** Coming back from /voluntarios/postular shows this, not a frozen form. */
export default function Loading() {
  return <ScreenSkeleton variant="detail" />;
}
