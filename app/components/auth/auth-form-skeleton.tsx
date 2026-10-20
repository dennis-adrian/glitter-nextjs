import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Roughly each Clerk card's height, so swapping the card in barely moves the page. */
const HEIGHTS = {
  signIn: "h-[450px]",
  signUp: "h-[500px]",
} as const;

type AuthFormSkeletonProps = {
  variant: keyof typeof HEIGHTS;
  className?: string;
};

/**
 * Stand-in for Clerk's sign-in and sign-up cards. The routes' `loading.tsx`
 * and the forms share it, so the placeholder stays the same box from the first
 * HTML until Clerk has drawn its card. As wide as Clerk's card: 25rem, but
 * never wider than the viewport minus 2.5rem.
 */
export default function AuthFormSkeleton({
  variant,
  className,
}: AuthFormSkeletonProps) {
  return (
    <Skeleton
      className={cn(
        "w-[400px] max-w-[calc(100vw-2.5rem)]",
        HEIGHTS[variant],
        className,
      )}
    />
  );
}
