"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/app/lib/utils";
import {
  volunteerAdminPath,
  volunteerSetupAdminPath,
} from "@/app/lib/volunteers/admin-definitions";

/**
 * The volunteer admin's two screens: the applications inbox (and each
 * application under it) and the call's setup (dates, roles, shifts).
 */
export default function VolunteerAdminTabs({
  festivalId,
}: {
  festivalId: number;
}) {
  const pathname = usePathname();
  const setupPath = volunteerSetupAdminPath(festivalId);
  const onSetup = pathname.startsWith(setupPath);
  const tabs = [
    {
      label: "Postulaciones",
      href: volunteerAdminPath(festivalId),
      active: !onSetup,
    },
    { label: "Convocatoria", href: setupPath, active: onSetup },
  ];

  return (
    <nav
      aria-label="Secciones de voluntarios"
      className="inline-flex h-10 max-w-full items-center rounded-md bg-muted p-1 text-muted-foreground"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-8 items-center justify-center rounded-sm px-3 text-sm font-medium whitespace-nowrap ring-offset-background transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
            tab.active
              ? "bg-background text-foreground shadow-xs"
              : "hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
