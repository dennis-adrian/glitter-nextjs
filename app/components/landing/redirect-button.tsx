"use client";

import { HTMLAttributes } from "react";

import { cn } from "@/app/lib/utils";
import { RedirectButton } from "@/app/components/redirect-button";

const LandingRedirectButton = ({
  className,
  userId = undefined,
}: {
  userId: number | string | undefined;
} & HTMLAttributes<HTMLButtonElement>) => {
  return (
    <RedirectButton
      variant="cta"
      className={`${cn("text-lg p-6 max-w-52", className)}`}
      href={`${userId ? "/next_event" : "/sign_up"}`}
    >
      ¡Quiero participar!
    </RedirectButton>
  );
};

export default LandingRedirectButton;
