"use client";

import { SignUp } from "@clerk/nextjs";

import AuthFormSkeleton from "@/app/components/auth/auth-form-skeleton";
import { useHydrated } from "@/app/hooks/use-hydrated";

/**
 * Clerk's `<SignUp />`, kept out of the server render and out of hydration.
 * Same reason as `SignInForm`: `<SignUp />` reads `clerk.loaded` during render,
 * which is always false on the server and often true by hydration time.
 */
export default function SignUpForm() {
  const hydrated = useHydrated();
  const skeleton = <AuthFormSkeleton variant="signUp" />;

  return hydrated ? <SignUp fallback={skeleton} /> : skeleton;
}
