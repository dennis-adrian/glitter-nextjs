// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import CredentialsSourcesCard from "@/app/components/festivals/credentials/credentials-sources-card";
import CredentialsSummaryView from "@/app/components/festivals/credentials/credentials-summary-view";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import {
  addExternal,
  addReservation,
  emptyData,
} from "@/app/lib/credentials/__fixtures__/data";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  parseCredentialFilters,
  type CredentialFilters,
} from "@/app/lib/credentials/definitions";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));

afterEach(() => {
  cleanup();
  replace.mockReset();
});

function festival() {
  const data = emptyData();
  addReservation(data, { people: [{ name: "Confirmada" }] });
  addReservation(data, { people: [{ name: "Pagando" }], status: "verification_payment" });
  addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
  addExternal(data, { name: "Refugio" });
  data.volunteers.push({ applicationId: 1, fullName: "Vol", roleName: null });
  return data;
}

describe("CredentialsSourcesCard", () => {
  it("counts reservations per status and keeps confirmed ones always on", () => {
    renderWithCredentials(<CredentialsSourcesCard groups={["external", "volunteer"]} />, {
      data: festival(),
    });
    const confirmed = screen.getByRole("checkbox", { name: "Confirmadas" });
    expect(confirmed.getAttribute("data-state")).toBe("checked");
    expect(confirmed.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("1 reserva. Siempre se cuentan.")).toBeTruthy();
    expect(screen.getByText("1 reserva que todavía no pagó.")).toBeTruthy();
    expect(screen.getByText("1 postulación aceptada")).toBeTruthy();
    expect(screen.queryByText("Equipo Glitter")).toBeNull();
  });

  it("mirrors the toggles to the URL and updates the totals at once", () => {
    renderWithCredentials(
      <CredentialsSummaryView groups={["external", "volunteer"]} />,
      { data: festival() },
    );
    // 2 confirmed + 2 external + 1 volunteer.
    expect(screen.getByText("Total a producir").parentElement!.textContent).toContain("5");

    fireEvent.click(screen.getByRole("checkbox", { name: "Pendientes" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/dashboard/festivals/1/credentials?estados=pendientes",
      { scroll: false },
    );
    expect(screen.getByText("Total a producir").parentElement!.textContent).toContain("7");

    fireEvent.click(screen.getByRole("switch", { name: "Voluntarios" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/dashboard/festivals/1/credentials?estados=pendientes&grupos=externos%2Cequipo",
      { scroll: false },
    );
    expect(screen.getByText("Total a producir").parentElement!.textContent).toContain("6");
  });

  it("reads the filters back from a URL it did not write, as on Back", () => {
    const data = festival();
    const page = (filters: CredentialFilters) => (
      <CredentialsProvider
        festivalId={data.festival.id}
        tab="resumen"
        data={data}
        initialFilters={filters}
        isAdmin
      >
        <CredentialsSummaryView groups={["external", "volunteer"]} />
      </CredentialsProvider>
    );
    const total = () => screen.getByText("Total a producir").parentElement!.textContent;
    const { rerender } = render(page(DEFAULT_CREDENTIAL_FILTERS));

    fireEvent.click(screen.getByRole("checkbox", { name: "Pendientes" }));
    expect(total()).toContain("7");
    // Its own write lands: the page hands back the same filters.
    rerender(page(parseCredentialFilters({ estados: "pendientes" })));
    expect(total()).toContain("7");

    // Back to the URL without filters.
    rerender(page(DEFAULT_CREDENTIAL_FILTERS));
    expect(total()).toContain("5");
    expect(screen.getByRole("checkbox", { name: "Pendientes" }).getAttribute("data-state")).toBe(
      "unchecked",
    );
  });
});
