"use client";

import Link from "next/link";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import {
  CREDENTIAL_TAB_LABELS,
  type CredentialTab,
} from "@/app/lib/credentials/definitions";
import { cn } from "@/app/lib/utils";

/**
 * Link tabs, like Comunicados': each keeps the current filters. They scroll
 * sideways inside their own box on a phone, so the page never does.
 */
export default function CredentialsTabs({
  tabs,
}: {
  /** The tabs this build offers, in order. */
  tabs: readonly CredentialTab[];
}) {
  const { tab, hrefFor } = useCredentials();
  return (
    <nav
      aria-label="Secciones de credenciales"
      className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-b px-1 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((value) => {
        const isActive = value === tab;
        return (
          <Link
            key={value}
            href={hrefFor(value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {CREDENTIAL_TAB_LABELS[value]}
          </Link>
        );
      })}
    </nav>
  );
}
