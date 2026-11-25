import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  type CredentialFilters,
  type CredentialTab,
} from "@/app/lib/credentials/definitions";

/**
 * Renders a credentials component inside its provider. Tests mock
 * `next/navigation` themselves (see `navigationMock`).
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
    <CredentialsProvider
      festivalId={data.festival.id}
      tab={tab}
      data={data}
      initialFilters={filters}
      isAdmin={isAdmin}
    >
      {ui}
    </CredentialsProvider>,
  );
}
