"use client";

import { HTMLAttributes } from "react";

import { cn } from "@/app/lib/utils";
import { RedirectButton } from "@/app/components/redirect-button";

const LandingRedirectButton = ({
  className,
  festivalId,
}: {
  festivalId?: number | string | undefined;
} & HTMLAttributes<HTMLButtonElement>) => {
  return (
    <RedirectButton
      variant="cta"
      className={`${cn("text-lg p-6 max-w-52", className)}`}
      href={`/festivals/${festivalId}/registration`}
    >
      ¡Quiero registrarme!
    </RedirectButton>
  );
};

export default LandingRedirectButton;
