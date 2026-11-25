// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CredentialsSourcesCard from "@/app/components/festivals/credentials/credentials-sources-card";
import CredentialsSummaryView from "@/app/components/festivals/credentials/credentials-summary-view";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import {
  addExternal,
  addReservation,
  emptyData,
} from "@/app/lib/credentials/__fixtures__/data";

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
});
