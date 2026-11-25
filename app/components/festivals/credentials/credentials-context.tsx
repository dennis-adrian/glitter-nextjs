"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
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
 * The page's live state. The status and group toggles are client state,
 * mirrored to the URL (`?estados=`, `?grupos=`) so a filtered view can be
 * shared and the export link carries the same filters; the calculator runs
 * here, so they answer instantly.
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
  const [filters, setFilterState] = useState(initialFilters);
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
      setFilterState(next);
      router.replace(hrefFor(tab, next), { scroll: false });
    },
    [hrefFor, router, tab],
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
