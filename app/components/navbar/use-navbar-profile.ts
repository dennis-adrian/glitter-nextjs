"use client";

import type { NavbarProfile } from "@/app/api/users/definitions";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export function useNavbarProfile() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  /**
   * Whose profile last failed to load. Kept by user: another one loads
   * afresh, and the same one is fetched again on signing in again.
   */
  const [failedUserId, setFailedUserId] = useState<string | null>(null);

  // Boolean() rather than the bare chain: `isSignedIn` is undefined until
  // Clerk loads, and consumers thread this down as a typed `boolean` prop.
  const isLoadingProfile = Boolean(
    isSignedIn &&
    isLoaded &&
    user?.id != null &&
    profileUserId !== user.id &&
    failedUserId !== user.id,
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    if (profileUserId === user.id) {
      return;
    }

    const userId = user.id;
    let isCurrent = true;
    // A full navigation away (a redirect after the page started streaming
    // is one) hides the page, then fails whatever is still in flight: that
    // failure is the browser's, not the profile's.
    let leaving = false;
    const onLeave = () => {
      leaving = true;
    };
    window.addEventListener("pagehide", onLeave);

    fetch("/api/users/navbar-profile", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch navbar profile.");
        }

        return response.json() as Promise<NavbarProfile | null>;
      })
      .then((data) => {
        if (isCurrent) {
          setProfile(data);
          setProfileUserId(userId);
          setFailedUserId(null);
        }
      })
      .catch((error) => {
        if (!leaving) console.error(error);
        if (isCurrent) {
          setProfile(null);
          setFailedUserId(userId);
        }
      });

    return () => {
      isCurrent = false;
      window.removeEventListener("pagehide", onLeave);
    };
  }, [isLoaded, isSignedIn, user?.id, profileUserId]);

  return {
    profile: isSignedIn && profileUserId === user?.id ? profile : null,
    isLoading: !isLoaded || isLoadingProfile,
  };
}
