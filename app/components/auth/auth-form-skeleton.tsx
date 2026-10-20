import { Skeleton } from "@/app/components/ui/skeleton";

/** Roughly each Clerk card's size, so swapping the card in barely moves the page. */
const SIZES = {
  signIn: "w-[400px] h-[450px]",
  signUp: "w-[400px] h-[500px]",
} as const;

type AuthFormSkeletonProps = {
  variant: keyof typeof SIZES;
};

/**
 * Stand-in for Clerk's sign-in and sign-up cards. The routes' `loading.tsx`
 * and the forms share it, so the placeholder stays the same box from the first
 * HTML until Clerk has drawn its card.
 */
export default function AuthFormSkeleton({ variant }: AuthFormSkeletonProps) {
  return <Skeleton className={SIZES[variant]} />;
}
