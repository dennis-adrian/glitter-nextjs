import { render } from "@testing-library/react";
import { startTransition, useEffect, useState, type ReactNode } from "react";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  parseCredentialFilters,
  type CredentialFilters,
  type CredentialTab,
} from "@/app/lib/credentials/definitions";

/** The filters a URL carries, parsed the way the credentials page does. */
export function filtersFromHref(href: string): CredentialFilters {
  return parseCredentialFilters(
    Object.fromEntries(new URL(href, "http://localhost").searchParams),
  );
}

let navigateHarness: ((href: string) => void) | null = null;

/**
 * Stands in for a `router.replace` that lands: the rendered provider gets the
 * filters of `href` back from its page, in a transition, as Next delivers
 * them. Point a test's `next/navigation` mock at it, e.g.
 * `replace.mockImplementation(navigateTo)`. Without it a toggle's
 * optimistic update is dropped as soon as its transition ends, because
 * nothing navigated.
 */
export function navigateTo(href: string) {
  navigateHarness?.(href);
}

/** The page around the provider: it owns the URL's filters. */
function CredentialsPage({
  data,
  filters: initialFilters,
  tab,
  isAdmin,
  children,
}: {
  data: CredentialsData;
  filters: CredentialFilters;
  tab: CredentialTab;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const [filters, setFilters] = useState(initialFilters);
  useEffect(() => {
    navigateHarness = (href) => startTransition(() => setFilters(filtersFromHref(href)));
    return () => {
      navigateHarness = null;
    };
  }, []);
  return (
    <CredentialsProvider
      festivalId={data.festival.id}
      tab={tab}
      data={data}
      initialFilters={filters}
      isAdmin={isAdmin}
    >
      {children}
    </CredentialsProvider>
  );
}

/**
 * Renders a credentials component inside its provider, under a page that
 * hands the provider its URL filters (see `navigateTo`). Tests mock
 * `next/navigation` themselves.
 */
export function renderWithCredentials(
  ui: ReactNode,
  {
    data,
    filters = DEFAULT_CREDENTIAL_FILTERS,
    tab = "resumen",
    isAdmin = true,
  }: {
    data: CredentialsData;
    filters?: CredentialFilters;
    tab?: CredentialTab;
    isAdmin?: boolean;
  },
) {
  return render(
    <CredentialsPage data={data} filters={filters} tab={tab} isAdmin={isAdmin}>
      {ui}
    </CredentialsPage>,
  );
}
