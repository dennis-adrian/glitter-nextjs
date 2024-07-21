"use client";

import { HTMLAttributes } from "react";

import { cn } from "@/app/lib/utils";
import { RedirectButton } from "@/app/components/redirect-button";

const LandingRedirectButton = ({
  className,
  festivalId,
  href,
  ...props
}: {
  festivalId?: number | string | undefined;
  href: string;
} & HTMLAttributes<HTMLButtonElement>) => {
  return (
    <RedirectButton
      variant="cta"
      className={`${cn("text-lg p-6 max-w-52", className)}`}
      href={href}
    >
      {props.children}
    </RedirectButton>
  );
};

export default LandingRedirectButton;
