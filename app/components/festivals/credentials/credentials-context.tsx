"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  type ReactNode,
} from "react";

import {
  buildView,
  resolveRules,
  type CredentialsData,
  type CredentialView,
} from "@/app/lib/credentials/calculate";
import {
  credentialFilterParams,
  type CredentialFilters,
  type CredentialRules,
  type CredentialTab,
} from "@/app/lib/credentials/definitions";

type CredentialsContextValue = {
  festivalId: number;
  festivalName: string;
  tab: CredentialTab;
  data: CredentialsData;
  rules: CredentialRules;
  filters: CredentialFilters;
  setFilters: (next: CredentialFilters) => void;
  /** Everything the screens show, under the current filters. */
  view: CredentialView;
  isAdmin: boolean;
  /** Search params for links that keep the current tab and filters. */
  hrefFor: (tab: CredentialTab) => string;
};

const CredentialsContext = createContext<CredentialsContextValue | null>(null);

export function useCredentials(): CredentialsContextValue {
  const value = useContext(CredentialsContext);
  if (!value) throw new Error("useCredentials needs a CredentialsProvider");
  return value;
}

/**
 * The page's live state. The status and group toggles live in the URL
 * (`?estados=`, `?grupos=`), so a filtered view can be shared and the export
 * link carries the same filters: `initialFilters` is what the page parsed
 * from the URL on show, and it leads.
 *
 * A toggle answers at once as an optimistic update over it, in the same
 * transition as the `router.replace` that writes the URL. When that
 * navigation lands, the page hands back the new filters. When Back, forward
 * or a link discards it first, the transition ends on that URL instead and
 * the optimistic toggle is dropped, so the screen and the address bar cannot
 * disagree.
 */
export function CredentialsProvider({
  festivalId,
  tab,
  data,
  initialFilters,
  isAdmin,
  children,
}: {
  festivalId: number;
  tab: CredentialTab;
  data: CredentialsData;
  initialFilters: CredentialFilters;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setOptimisticFilters] = useOptimistic(initialFilters);
  const rules = useMemo(() => resolveRules(data.ruleRows), [data.ruleRows]);
  const view = useMemo(() => buildView(data, rules, filters), [data, rules, filters]);

  const hrefFor = useCallback(
    (next: CredentialTab, nextFilters: CredentialFilters = filters) => {
      const params = new URLSearchParams(credentialFilterParams(nextFilters));
      if (next !== "resumen") params.set("tab", next);
      const search = params.toString();
      return `${pathname}${search ? `?${search}` : ""}`;
    },
    [filters, pathname],
  );

  const setFilters = useCallback(
    (next: CredentialFilters) => {
      // One transition: Next's navigation joins it and keeps it pending until
      // the page renders the new URL, so the optimistic filters last exactly
      // as long as that navigation.
      startTransition(() => {
        setOptimisticFilters(next);
        router.replace(hrefFor(tab, next), { scroll: false });
      });
    },
    [hrefFor, router, setOptimisticFilters, tab],
  );

  const value = useMemo(
    () => ({
      festivalId,
      festivalName: data.festival.name,
      tab,
      data,
      rules,
      filters,
      setFilters,
      view,
      isAdmin,
      hrefFor: (next: CredentialTab) => hrefFor(next),
    }),
    [festivalId, tab, data, rules, filters, setFilters, view, isAdmin, hrefFor],
  );

  return <CredentialsContext.Provider value={value}>{children}</CredentialsContext.Provider>;
}
