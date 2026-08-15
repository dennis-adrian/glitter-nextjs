"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type FastPassNavTabsProps = {
  festivalId: number;
};

export default function FastPassNavTabs({ festivalId }: FastPassNavTabsProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/festivals/${festivalId}/fast-pass`;

  const tabs = [
    { label: "Resumen", href: basePath },
    { label: "Configuración", href: `${basePath}/settings` },
    { label: "Compras", href: `${basePath}/purchases` },
    { label: "Transacciones", href: `${basePath}/transactions` },
    { label: "Tickets", href: `${basePath}/tickets` },
    { label: "Operadores POS", href: `${basePath}/operators` },
    { label: "Reembolsos", href: `${basePath}/refunds` },
    { label: "Check-in", href: `${basePath}/check-in` },
  ];

  return (
    <div className="inline-flex h-auto min-h-10 flex-wrap items-center justify-center gap-1 rounded-md bg-muted p-1 text-muted-foreground">
      {tabs.map((tab) => {
        const isActive =
          tab.href === basePath
            ? pathname === basePath
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-background text-foreground shadow-xs"
                : "hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
