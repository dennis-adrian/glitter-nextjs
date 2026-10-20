"use client";

import { SignUp } from "@clerk/nextjs";

import AuthFormSkeleton from "@/app/components/auth/auth-form-skeleton";
import { useHydrated } from "@/app/hooks/use-hydrated";

/**
 * Clerk's `<SignUp />`, kept out of the server render and out of hydration.
 * Same reasons as `SignInForm`: `<SignUp />` reads `clerk.loaded` during
 * render, which is always false on the server and often true by hydration
 * time, and Clerk's `fallback` would hide its mount point while it mounts.
 */
export default function SignUpForm() {
  const hydrated = useHydrated();

  return (
    <div className="group/auth contents">
      {hydrated && <SignUp />}
      <AuthFormSkeleton
        variant="signUp"
        className="group-has-[[data-clerk-component]>*]/auth:hidden"
      />
    </div>
  );
}
