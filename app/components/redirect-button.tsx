"use client";

import Link from "next/link";

import { cn } from "@/app/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { HTMLAttributes, useEffect, useState } from "react";

export function RedirectButton({
  children,
  href,
  variant,
  ...props
}: {
  children: React.ReactNode;
  href: string;
} & VariantProps<typeof buttonVariants> &
  HTMLAttributes<HTMLButtonElement>) {
  const [loading, setLoading] = useState(false);
  const path = usePathname();

  useEffect(() => {
    if (path === href) {
      setLoading(false);
    }
  }, [path, href]);

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
