"use client";

import { GiftIcon, MegaphoneIcon, UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const sections = [
  {
    value: "comunicados",
    label: "Comunicados",
    href: "/dashboard/communications",
    icon: MegaphoneIcon,
  },
  {
    value: "lists",
    label: "Listas",
    href: "/dashboard/communications/lists",
    icon: UsersRoundIcon,
  },
  {
    // Gifts live under Créditos; the rail links there (PRD §6).
    value: "gifts",
    label: "Regalos de créditos",
    href: "/dashboard/credits/gifts",
    icon: GiftIcon,
  },
] as const;

type Section = (typeof sections)[number]["value"];

function activeSection(pathname: string): Section | null {
  if (pathname.startsWith("/dashboard/communications/lists")) return "lists";
  if (pathname.startsWith("/dashboard/communications")) return "comunicados";
  return null;
}

/** Same shape as the credits rail, so the two admin areas read alike. */
export default function CommunicationsNav() {
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
        aria-label="Secciones de comunicaciones"
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
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
