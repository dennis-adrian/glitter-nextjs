import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { VariantProps } from "class-variance-authority";

export function RedirectButton({
  children,
  href,
  variant,
  ...props
}: {
  children: React.ReactNode;
  href: string;
} & VariantProps<typeof buttonVariants>) {
  const [loading, setLoading] = useState(false);

  return loading ? (
    <Button disabled variant={variant} {...props}>
      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
      Cargando
    </Button>
  ) : (
    <Link href={href}>
      <Button variant={variant} onClick={() => setLoading(true)} {...props}>
        {children}
      </Button>
    </Link>
  );
}
