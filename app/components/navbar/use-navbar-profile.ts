"use client";

import type { NavbarProfile } from "@/app/api/users/definitions";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export function useNavbarProfile() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileFetchError, setProfileFetchError] = useState(false);

  const isLoadingProfile =
    isSignedIn &&
    isLoaded &&
    user?.id != null &&
    profileUserId !== user.id &&
    !profileFetchError;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      setProfileFetchError(false);
      return;
    }

    if (profileUserId === user.id) {
      return;
    }

    let isCurrent = true;
    setProfileFetchError(false);

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
          setProfileUserId(user.id);
        }
      })
      .catch((error) => {
        console.error(error);
        if (isCurrent) {
          setProfile(null);
          setProfileFetchError(true);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isLoaded, isSignedIn, user?.id, profileUserId]);

  return {
    profile: isSignedIn && profileUserId === user?.id ? profile : null,
    isLoading: !isLoaded || isLoadingProfile,
  };
}
