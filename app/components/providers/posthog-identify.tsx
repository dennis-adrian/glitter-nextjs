"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";

import {
  identifyClientUser,
  resetClientIdentity,
} from "@/app/lib/posthog-capture";

export default function PostHogAuthIdentify() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (user) {
      identifyClientUser(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
      });
    } else {
      resetClientIdentity();
    }
  }, [user, isLoaded]);

  return null;
}
