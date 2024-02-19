"use client";

import { RedirectButton } from "@/app/components/redirect-button";
import { cn } from "@/app/lib/utils";
import { User } from "@clerk/nextjs/server";
import { HTMLAttributes } from "react";

const LandingRedirectButton = ({
  className,
  userId = undefined,
}: {
  userId: number | string | undefined;
} & HTMLAttributes<HTMLButtonElement>) => {
  return (
    <RedirectButton
      className={`${cn("text-lg p-6 max-w-52", className)}`}
      href={`${userId ? "/next_event" : "/sign_up"}`}
    >
      ¡Quiero participar!
    </RedirectButton>
  );
};

export default LandingRedirectButton;
