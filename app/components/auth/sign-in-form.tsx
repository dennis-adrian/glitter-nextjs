"use client";

import { SignIn } from "@clerk/nextjs";

import AuthFormSkeleton from "@/app/components/auth/auth-form-skeleton";
import { useHydrated } from "@/app/hooks/use-hydrated";

/**
 * Clerk's `<SignIn />`, kept out of the server render and out of hydration.
 *
 * `<SignIn />` renders its mount point only once `clerk.loaded`, a getter it
 * reads during render. The server never has clerk-js; a slow browser often
 * finishes loading it before this part of the page hydrates, so the two
 * renders disagree and React throws #418. Both now render the skeleton, and
 * Clerk's `fallback` keeps that skeleton up until its card has mounted.
 */
export default function SignInForm() {
  const hydrated = useHydrated();
  const skeleton = <AuthFormSkeleton variant="signIn" />;

  return hydrated ? <SignIn fallback={skeleton} /> : skeleton;
}
