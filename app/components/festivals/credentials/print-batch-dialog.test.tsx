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
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Lucía and Andrés are new; Camila was printed; Pendiente is hidden by the toggle. */
function festival() {
  const data = emptyData();
  const camila = addReservation(data, { people: [{ name: "Camila Rojas" }] });
  addReservation(data, { people: [{ name: "Lucía Fernández" }] });
  addReservation(data, { category: "gastronomy", people: [{ name: "Andrés Vaca" }] });
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
  return { data, camila };
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
    renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
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
    expect(input.holders).toHaveLength(2);
    expect(
      input.holders.every(
        (holder: { key: string; name: string }) =>
          holder.key.startsWith("participant:") && holder.name.length > 0,
      ),
    ).toBe(true);
    const sent = input.holders.reduce(
      (sum: number, holder: { named: number; unnamed: number; reprint: boolean }) => {
        expect(holder.reprint).toBe(false);
        return sum + holder.named + holder.unnamed;
      },
      0,
    );
    expect(sent).toBe(Number(within(dialog).getByTestId("batch-total").textContent!.split(" ")[0]));
  });
});
