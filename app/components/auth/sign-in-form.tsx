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
 * renders disagree and React throws #418. Both now render just the skeleton.
 *
 * The skeleton stays up until Clerk has put its card in the mount point.
 * Clerk's own `fallback` prop would do that too, but it hides the mount point
 * with `display: none` meanwhile, so a step that focuses its field on a fresh
 * load (password, verification code) would lose that focus.
 */
export default function SignInForm() {
  const hydrated = useHydrated();

  return (
    <div className="group/auth contents">
      {hydrated && <SignIn />}
      <AuthFormSkeleton
        variant="signIn"
        className="group-has-[[data-clerk-component]>*]/auth:hidden"
      />
    </div>
  );
}
