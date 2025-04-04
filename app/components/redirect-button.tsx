"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { HTMLAttributes, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/utils";

export function RedirectButton({
  children,
  href,
  variant,
  disabled = false,
  ...props
}: {
  children: React.ReactNode;
  href: string;
  disabled?: boolean;
} & VariantProps<typeof buttonVariants> &
  HTMLAttributes<HTMLButtonElement>) {
  const [loading, setLoading] = useState(false);

  if (disabled) {
    return (
      <Button disabled variant={variant} {...props}>
        {children}
      </Button>
    );
  }

  return loading ? (
    <Button disabled variant={variant} {...props}>
      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
      Cargando
    </Button>
  ) : (
    <Link className={cn("w-fit", props.className)} href={href}>
      <Button variant={variant} onClick={() => setLoading(true)} {...props}>
        {children}
      </Button>
    </Link>
  );
}
