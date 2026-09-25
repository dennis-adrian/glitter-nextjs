"use client";

import {
  AlertTriangleIcon,
  ClipboardCheckIcon,
  LayoutGridIcon,
  ListIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const sections = [
  {
    value: "overview",
    label: "Resumen",
    href: "/dashboard/credits",
    icon: LayoutGridIcon,
  },
  {
    value: "reviews",
    label: "Revisiones",
    href: "/dashboard/credits/reviews",
    icon: ClipboardCheckIcon,
  },
  {
    value: "accounts",
    label: "Saldos",
    href: "/dashboard/credits/accounts",
    icon: UsersIcon,
  },
  {
    value: "ledger",
    label: "Movimientos",
    href: "/dashboard/credits/ledger",
    icon: ListIcon,
  },
  {
    value: "debts",
    label: "Deudas",
    href: "/dashboard/credits/debts",
    icon: AlertTriangleIcon,
  },
] as const;

type Section = (typeof sections)[number]["value"];

function activeSection(pathname: string): Section {
  if (pathname.startsWith("/dashboard/credits/reviews")) return "reviews";
  if (pathname.startsWith("/dashboard/credits/accounts")) return "accounts";
  if (pathname.startsWith("/dashboard/credits/ledger")) return "ledger";
  if (pathname.startsWith("/dashboard/credits/debts")) return "debts";
  return "overview";
}

function CountBadge({
  count,
  tone,
}: {
  count: number;
  tone: "primary" | "red";
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
        tone === "red"
          ? "bg-red-600 text-white"
          : "bg-primary text-primary-foreground",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Same shape as the store's section rail, so the two admin areas read alike.
 * Not sticky: the credits pages fit the viewport, so it never scrolls away.
 */
export default function CreditsNav({
  pendingReviews,
  debtAccounts,
}: {
  pendingReviews: number;
  debtAccounts: number;
}) {
  const pathname = usePathname();
  const active = activeSection(pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On a phone the row scrolls, so the current section can start off-screen.
  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    activeRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <div className="shrink-0">
      <nav
        aria-label="Secciones de créditos"
        className="overflow-x-auto rounded-2xl border border-border/70 bg-muted/30 p-1 shadow-sm [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full gap-1">
          {sections.map(({ value, label, href, icon: Icon }) => {
            const isActive = active === value;
            return (
              <Link
                key={value}
                ref={isActive ? activeRef : undefined}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {value === "reviews" && (
                  <CountBadge count={pendingReviews} tone="primary" />
                )}
                {value === "debts" && (
                  <CountBadge count={debtAccounts} tone="red" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
