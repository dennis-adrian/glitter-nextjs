"use client";

import { useUser } from "@clerk/nextjs";

import type { NavbarProfile } from "@/app/api/users/definitions";
import type { NavViewer } from "@/app/components/navbar/app-navigation";

/**
 * Who the app shell is drawn for. The server knows on most requests, so the
 * sidebar and tab bar arrive in the first HTML instead of popping in; Clerk
 * takes over once it loads, which covers the `force-static` pages where the
 * server cannot ask and a sign-out in this tab.
 */
export function useAppViewer(
  serverViewer: NavViewer | null,
  profile: NavbarProfile | null,
): { signedIn: boolean; viewer: NavViewer | null } {
  const { isLoaded, isSignedIn } = useUser();
  const signedIn = isLoaded ? Boolean(isSignedIn) : serverViewer != null;

  if (!signedIn) return { signedIn, viewer: null };

  return {
    signedIn,
    viewer: profile
      ? { role: profile.role, status: profile.status }
      : serverViewer,
  };
}
