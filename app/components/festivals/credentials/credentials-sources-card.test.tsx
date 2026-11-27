// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { startTransition, Suspense, use, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import CredentialsSourcesCard from "@/app/components/festivals/credentials/credentials-sources-card";
import CredentialsSummaryView from "@/app/components/festivals/credentials/credentials-summary-view";
import {
  filtersFromHref,
  navigateTo,
  renderWithCredentials,
} from "@/app/components/festivals/credentials/test-utils";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import {
  addExternal,
  addReservation,
  emptyData,
} from "@/app/lib/credentials/__fixtures__/data";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  type CredentialFilters,
} from "@/app/lib/credentials/definitions";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));

beforeEach(() => {
  // A navigation that lands at once; `routedPage` below holds it pending.
  replace.mockImplementation(navigateTo);
});

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

  // The instant answer before a navigation lands is covered under
  // "CredentialsProvider and the URL"; here each navigation lands at once.
  it("writes each toggle to the URL and counts what the page hands back", () => {
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

/**
 * The page under a router modelled on Next 16's action queue
 * (`app-router-instance.js`): `replace` sets the router state to a promise in
 * a transition, resolved when the page's server render arrives; Back
 * (`ACTION_RESTORE`) sets the restored state in a transition of its own and
 * leaves the navigation it discarded unresolved for good.
 */
function routedPage(data: CredentialsData) {
  const pending: { href: string; resolve: (filters: CredentialFilters) => void }[] = [];
  let setRouterState: (state: CredentialFilters | Promise<CredentialFilters>) => void = () => {};

  function Page() {
    const [state, setState] = useState<CredentialFilters | Promise<CredentialFilters>>(
      DEFAULT_CREDENTIAL_FILTERS,
    );
    setRouterState = setState;
    const filters = state instanceof Promise ? use(state) : state;
    return (
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
  }

  replace.mockImplementation((href: string) => {
    const navigation = new Promise<CredentialFilters>((resolve) => {
      pending.push({ href, resolve });
    });
    startTransition(() => setRouterState(navigation));
  });

  render(
    <Suspense fallback={<p>Cargando</p>}>
      <Page />
    </Suspense>,
  );

  return {
    total: () => screen.getByText("Total a producir").parentElement!.textContent,
    pendientes: () =>
      screen.getByRole("checkbox", { name: "Pendientes" }).getAttribute("data-state"),
    /** The latest navigation's server render arrives; earlier ones were discarded. */
    land: () =>
      act(async () => {
        const navigation = pending.at(-1)!;
        navigation.resolve(filtersFromHref(navigation.href));
      }),
    back: (filters: CredentialFilters) =>
      act(async () => {
        startTransition(() => setRouterState(filters));
      }),
  };
}

describe("CredentialsProvider and the URL", () => {
  // React logs an optimistic update made outside a transition; the toggle's
  // must share one with its navigation, so any logged error fails the test.
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error");
  });
  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows a toggle while its navigation is pending and keeps it once it lands", async () => {
    const page = routedPage(festival());
    expect(page.total()).toContain("5");

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Pendientes" }));
    });
    expect(replace).toHaveBeenLastCalledWith(
      "/dashboard/festivals/1/credentials?estados=pendientes",
      { scroll: false },
    );
    expect(page.total()).toContain("7");
    expect(page.pendientes()).toBe("checked");

    await page.land();
    expect(page.total()).toContain("7");
    expect(page.pendientes()).toBe("checked");
  });

  it("drops a toggle whose navigation Back discarded before it landed", async () => {
    const page = routedPage(festival());
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Pendientes" }));
    });
    expect(page.total()).toContain("7");

    // Back to an entry with the same filters the screen had: no prop change
    // to react to, only the discarded navigation's transition ending.
    await page.back(DEFAULT_CREDENTIAL_FILTERS);
    expect(page.total()).toContain("5");
    expect(page.pendientes()).toBe("unchecked");
  });

  it("reads back the filters of a URL it did not write, as on Back after a toggle landed", async () => {
    const page = routedPage(festival());
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Pendientes" }));
    });
    await page.land();
    expect(page.total()).toContain("7");

    await page.back(DEFAULT_CREDENTIAL_FILTERS);
    expect(page.total()).toContain("5");
    expect(page.pendientes()).toBe("unchecked");
  });

  it("builds a quick second toggle on the first and settles on the last navigation", async () => {
    const page = routedPage(festival());
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Pendientes" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Voluntarios" }));
    });
    expect(replace).toHaveBeenLastCalledWith(
      "/dashboard/festivals/1/credentials?estados=pendientes&grupos=externos%2Cequipo",
      { scroll: false },
    );
    expect(page.total()).toContain("6");

    await page.land();
    expect(page.total()).toContain("6");
    expect(page.pendientes()).toBe("checked");
  });
});
