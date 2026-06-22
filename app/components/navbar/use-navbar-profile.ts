"use client";

import type { NavbarProfile } from "@/app/api/users/definitions";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export function useNavbarProfile() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [profile, setProfile] = useState<NavbarProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setProfile(null);
      setIsLoadingProfile(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingProfile(true);

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
        }
      })
      .catch((error) => {
        console.error(error);
        if (isCurrent) {
          setProfile(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isLoaded, isSignedIn, user?.id]);

  return {
    profile,
    isLoading: !isLoaded || isLoadingProfile,
  };
}
