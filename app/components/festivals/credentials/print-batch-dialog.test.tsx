// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrintBatchDialog from "@/app/components/festivals/credentials/print-batch-dialog";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addReservation, batch, emptyData } from "@/app/lib/credentials/__fixtures__/data";

const createCredentialPrintBatch = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({ createCredentialPrintBatch }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));
const isDesktop = vi.hoisted(() => ({ value: true }));
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => isDesktop.value }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  isDesktop.value = true;
});

/** Lucía and Andrés are new; Camila was printed; Pendiente is hidden by the toggle. */
function festival() {
  const data = emptyData();
  const camila = addReservation(data, { people: [{ name: "Camila Rojas" }] });
  const lucia = addReservation(data, { people: [{ name: "Lucía Fernández" }] });
  const andres = addReservation(data, { category: "gastronomy", people: [{ name: "Andrés Vaca" }] });
  addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
  data.batches.push(
    batch([
      {
        unitKey: `participant:${camila.participations[0]}`,
        group: "illustration",
        userId: null,
        printedName: "Camila Rojas",
        detail: "",
        namedCount: 1,
        unnamedCount: 0,
        isReprint: false,
      },
      {
        unitKey: `reservation:${camila.reservationId}`,
        group: "illustration",
        userId: null,
        printedName: null,
        detail: "",
        namedCount: 0,
        unnamedCount: 1,
        isReprint: false,
      },
    ]),
  );
  return { data, camila, lucia, andres };
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Marcar como enviadas a imprenta" }));
  return screen.getByRole("dialog");
}

describe("PrintBatchDialog", () => {
  it("starts with what is new under the page's filters, with live totals", () => {
    renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
    const dialog = open();
    // Lucía 1+1, Andrés 2 named.
    expect(within(dialog).getByText("Marcar 4 credenciales como enviadas a imprenta")).toBeTruthy();
    expect(within(dialog).getByTestId("batch-total").textContent).toBe(
      "4 · 3 con nombre, 1 sin nombre",
    );
    expect(within(dialog).getByText("Exportar estas 4 en CSV")).toBeTruthy();
  });

  it("searches without case or accents, removes and adds, and undoes", () => {
    renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
    const dialog = open();
    const search = within(dialog).getByLabelText("Quitar o sumar a alguien");
    fireEvent.change(search, { target: { value: "LUCIA" } });
    const lucia = within(dialog).getByRole("checkbox", { name: "Incluir a Lucía Fernández en el lote" });
    expect(lucia.getAttribute("data-state")).toBe("checked");
    fireEvent.click(lucia);
    expect(within(dialog).getByText(/Quitada de este lote\. Seguirá como nueva/)).toBeTruthy();
    expect(within(dialog).getByTestId("batch-total").textContent).toBe("2 · 2 con nombre");

    // A printed holder comes back as a reprint; the pending one can be added too.
    fireEvent.change(search, { target: { value: "camila" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Camila Rojas en el lote" }));
    expect(within(dialog).getByText(/Sumada para reimprimir/)).toBeTruthy();
    expect(within(dialog).getByTestId("batch-total").textContent).toBe(
      "4 · 3 con nombre, 1 sin nombre",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Volver a incluir" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
    expect(within(dialog).queryByText("Cambios a mano")).toBeNull();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(dialog).getByText("Nadie con credencial coincide con esa búsqueda.")).toBeTruthy();
  });

  it("pre-selects pending reservations when the page counts them", () => {
    renderWithCredentials(<PrintBatchDialog />, {
      data: festival().data,
      filters: {
        statuses: { verification_payment: false, pending: true },
        groups: { external: true, volunteer: true, staff: true },
      },
    });
    const dialog = open();
    expect(within(dialog).getByText("Marcar 6 credenciales como enviadas a imprenta")).toBeTruthy();
  });

  it("keeps Cancelar and Marcar como enviadas in one row and sends the counts it shows", async () => {
    createCredentialPrintBatch.mockResolvedValue({ success: true, message: "Listo." });
    const { data, lucia, andres } = festival();
    renderWithCredentials(<PrintBatchDialog />, { data });
    const dialog = open();
    const footer = within(dialog).getByTestId("batch-footer");
    expect(footer.className).toContain("grid-cols-2");
    expect(within(footer).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Cancelar",
      "Marcar como enviadas",
    ]);
    fireEvent.change(within(dialog).getByLabelText("Nota"), { target: { value: "Imprenta Sol" } });
    fireEvent.click(within(footer).getByRole("button", { name: "Marcar como enviadas" }));
    await waitFor(() => expect(createCredentialPrintBatch).toHaveBeenCalledTimes(1));
    const input = createCredentialPrintBatch.mock.calls[0]![0];
    expect(input.festivalId).toBe(1);
    expect(input.note).toBe("Imprenta Sol");
    // The print history it was opened on: the fixture's one batch.
    expect(data.batches).toHaveLength(1);
    expect(input.lastBatchId).toBe(data.batches[0]!.id);
    // Exactly the pre-selected two, each with the counts it was shown.
    const byKey = Object.fromEntries(
      input.holders.map(
        (holder: { key: string; name: string; named: number; unnamed: number }) => [
          holder.key,
          { name: holder.name, named: holder.named, unnamed: holder.unnamed },
        ],
      ),
    );
    expect(byKey).toEqual({
      [`participant:${lucia.participations[0]}`]: { name: "Lucía Fernández", named: 1, unnamed: 1 },
      [`participant:${andres.participations[0]}`]: { name: "Andrés Vaca", named: 2, unnamed: 0 },
    });
    const sent = input.holders.reduce(
      (sum: number, holder: { named: number; unnamed: number; reprint: boolean }) => {
        expect(holder.reprint).toBe(false);
        return sum + holder.named + holder.unnamed;
      },
      0,
    );
    expect(sent).toBe(Number(within(dialog).getByTestId("batch-total").textContent!.split(" ")[0]));
  });

  it("does not open the phone search while marking", async () => {
    isDesktop.value = false;
    // The phone sheet is vaul's drawer, which reads media queries.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }));
    let finish!: (result: { success: boolean; message: string }) => void;
    createCredentialPrintBatch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
    const dialog = open();
    const search = within(dialog).getByRole("button", { name: "Buscar por nombre" });
    expect(search.hasAttribute("disabled")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Marcar como enviadas" }));
    await waitFor(() => expect(createCredentialPrintBatch).toHaveBeenCalledTimes(1));
    expect(search.hasAttribute("disabled")).toBe(true);
    finish({ success: false, message: "El lote cambió." });
    await waitFor(() => expect(search.hasAttribute("disabled")).toBe(false));
  });
});
