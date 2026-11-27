// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import PrintBatchDialog from "@/app/components/festivals/credentials/print-batch-dialog";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addReservation, batch, emptyData } from "@/app/lib/credentials/__fixtures__/data";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import { DEFAULT_CREDENTIAL_FILTERS } from "@/app/lib/credentials/definitions";

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
  vi.restoreAllMocks();
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

/**
 * The CSV download, kept off jsdom's navigation. jsdom has no object URLs, so
 * a stubbed URL global carries them; afterEach unstubs it and restores the
 * click spy.
 */
function stubDownload() {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:lote");
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return createObjectURL;
}

/** A copy of `data` with every `from` string replaced, as a refresh would bring. */
function renamed<T>(value: T, from: string, to: string): T {
  const walk = (node: unknown): unknown => {
    if (node === from) return to;
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object" && !(node instanceof Date)) {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  return walk(value) as T;
}

const OUTDATED = "Cambió la selección desde que exportaste el CSV. Exportalo de nuevo antes de marcar el lote.";

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
        (holder: { key: string; group: string; name: string; named: number; unnamed: number }) => [
          holder.key,
          { group: holder.group, name: holder.name, named: holder.named, unnamed: holder.unnamed },
        ],
      ),
    );
    expect(byKey).toEqual({
      [`participant:${lucia.participations[0]}`]: {
        group: "illustration",
        name: "Lucía Fernández",
        named: 1,
        unnamed: 1,
      },
      [`participant:${andres.participations[0]}`]: {
        group: "gastronomy",
        name: "Andrés Vaca",
        named: 2,
        unnamed: 0,
      },
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

  it("locks the selection and the note while marking", async () => {
    let finish!: (result: { success: boolean; message: string }) => void;
    createCredentialPrintBatch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
    const dialog = open();
    const search = within(dialog).getByLabelText("Quitar o sumar a alguien");
    // Lucía out and Camila in, so both kinds of hand change are on screen.
    fireEvent.change(search, { target: { value: "lucia" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Lucía Fernández en el lote" }));
    fireEvent.change(search, { target: { value: "camila" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Camila Rojas en el lote" }));
    const controls = () => [
      search,
      within(dialog).getByRole("checkbox", { name: "Incluir a Camila Rojas en el lote" }),
      within(dialog).getByRole("button", { name: "Volver a incluir" }),
      within(dialog).getByRole("button", { name: "Quitar" }),
      within(dialog).getByLabelText("Nota"),
    ];
    expect(controls().map((control) => control.hasAttribute("disabled"))).toEqual([false, false, false, false, false]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Marcar como enviadas" }));
    await waitFor(() => expect(createCredentialPrintBatch).toHaveBeenCalledTimes(1));
    expect(controls().map((control) => control.hasAttribute("disabled"))).toEqual([true, true, true, true, true]);
    // Exporting what is being marked changes nothing, so it stays available.
    expect(within(dialog).getByRole("button", { name: /Exportar estas/ }).hasAttribute("disabled")).toBe(false);

    finish({ success: false, message: "El lote cambió." });
    await waitFor(() =>
      expect(controls().map((control) => control.hasAttribute("disabled"))).toEqual([false, false, false, false, false]),
    );
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

  describe("after exporting the CSV", () => {
    it("blocks marking when the selection changed, until it is exported again", async () => {
      stubDownload();
      createCredentialPrintBatch.mockResolvedValue({ success: true, message: "Listo." });
      const { data, andres } = festival();
      renderWithCredentials(<PrintBatchDialog />, { data });
      const dialog = open();
      const submit = () => within(dialog).getByRole("button", { name: "Marcar como enviadas" });
      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      expect(within(dialog).queryByText(OUTDATED)).toBeNull();

      const search = within(dialog).getByLabelText("Quitar o sumar a alguien");
      fireEvent.change(search, { target: { value: "lucia" } });
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Lucía Fernández en el lote" }));
      expect(within(dialog).getByText(OUTDATED)).toBeTruthy();
      expect(submit().hasAttribute("disabled")).toBe(true);
      fireEvent.click(submit());
      expect(createCredentialPrintBatch).not.toHaveBeenCalled();
      // The footer stays one row with the notice above it.
      expect(within(dialog).getByTestId("batch-footer").className).toContain("grid-cols-2");

      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      expect(within(dialog).queryByText(OUTDATED)).toBeNull();
      expect(submit().hasAttribute("disabled")).toBe(false);
      fireEvent.click(submit());
      await waitFor(() => expect(createCredentialPrintBatch).toHaveBeenCalledTimes(1));
      expect(
        createCredentialPrintBatch.mock.calls[0]![0].holders.map((holder: { key: string }) => holder.key),
      ).toEqual([`participant:${andres.participations[0]}`]);
    });

    it("unblocks when hand changes are undone back to what was exported", () => {
      stubDownload();
      renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
      const dialog = open();
      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      const search = within(dialog).getByLabelText("Quitar o sumar a alguien");
      fireEvent.change(search, { target: { value: "camila" } });
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Camila Rojas en el lote" }));
      expect(within(dialog).getByText(OUTDATED)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
      expect(within(dialog).queryByText(OUTDATED)).toBeNull();
      expect(
        within(dialog).getByRole("button", { name: "Marcar como enviadas" }).hasAttribute("disabled"),
      ).toBe(false);
    });

    it("blocks marking when a refresh changes what the CSV carried", () => {
      stubDownload();
      const { data } = festival();
      // The provider alone, so a rerender hands it new data as a refresh does.
      const page = (next: CredentialsData) => (
        <CredentialsProvider
          festivalId={next.festival.id}
          tab="resumen"
          data={next}
          initialFilters={DEFAULT_CREDENTIAL_FILTERS}
          isAdmin
        >
          <PrintBatchDialog />
        </CredentialsProvider>
      );
      const view = render(page(data));
      const dialog = open();
      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      expect(within(dialog).queryByText(OUTDATED)).toBeNull();
      view.rerender(page(renamed(data, "Lucía Fernández", "Lucía Fernández Paz")));
      expect(within(dialog).getByText(OUTDATED)).toBeTruthy();
      expect(
        within(dialog).getByRole("button", { name: "Marcar como enviadas" }).hasAttribute("disabled"),
      ).toBe(true);
    });

    it("blocks marking when a refresh moves a holder to another group with the same counts", () => {
      stubDownload();
      const { data } = festival();
      const page = (next: CredentialsData) => (
        <CredentialsProvider
          festivalId={next.festival.id}
          tab="resumen"
          data={next}
          initialFilters={DEFAULT_CREDENTIAL_FILTERS}
          isAdmin
        >
          <PrintBatchDialog />
        </CredentialsProvider>
      );
      const view = render(page(data));
      const dialog = open();
      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      // Lucía's stand turns Emprendimiento: same default rule, so the same
      // counts, but the CSV's Grupo column no longer matches.
      view.rerender(page(renamed(data, "illustration", "entrepreneurship")));
      expect(within(dialog).getByText(OUTDATED)).toBeTruthy();
      expect(
        within(dialog).getByRole("button", { name: "Marcar como enviadas" }).hasAttribute("disabled"),
      ).toBe(true);
    });

    it("keeps the status region mounted and empty until the notice appears", () => {
      stubDownload();
      renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
      const dialog = open();
      const status = within(dialog).getByRole("status");
      expect(status.textContent).toBe("");
      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      const search = within(dialog).getByLabelText("Quitar o sumar a alguien");
      fireEvent.change(search, { target: { value: "lucia" } });
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Lucía Fernández en el lote" }));
      expect(within(dialog).getByRole("status")).toBe(status);
      expect(status.textContent).toBe(OUTDATED);
    });

    it("sends exactly the exported holders when nothing changed", async () => {
      const createObjectURL = stubDownload();
      createCredentialPrintBatch.mockResolvedValue({ success: true, message: "Listo." });
      const { data, lucia, andres } = festival();
      renderWithCredentials(<PrintBatchDialog />, { data });
      const dialog = open();
      fireEvent.click(within(dialog).getByRole("button", { name: /Exportar estas/ }));
      const blob = createObjectURL.mock.calls[0]![0];
      const csv = await blob.text();
      // The batch note is not in the CSV, so writing one does not block.
      fireEvent.change(within(dialog).getByLabelText("Nota"), { target: { value: "Imprenta Sol" } });
      expect(within(dialog).queryByText(OUTDATED)).toBeNull();
      fireEvent.click(within(dialog).getByRole("button", { name: "Marcar como enviadas" }));
      await waitFor(() => expect(createCredentialPrintBatch).toHaveBeenCalledTimes(1));
      const holders = createCredentialPrintBatch.mock.calls[0]![0].holders as {
        key: string;
        name: string;
      }[];
      expect(holders.map((holder) => holder.key).sort()).toEqual(
        [`participant:${lucia.participations[0]}`, `participant:${andres.participations[0]}`].sort(),
      );
      for (const holder of holders) expect(csv).toContain(holder.name);
    });
  });

  it("never blocks marking when no CSV was exported", async () => {
    createCredentialPrintBatch.mockResolvedValue({ success: true, message: "Listo." });
    renderWithCredentials(<PrintBatchDialog />, { data: festival().data });
    const dialog = open();
    const search = within(dialog).getByLabelText("Quitar o sumar a alguien");
    fireEvent.change(search, { target: { value: "lucia" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Incluir a Lucía Fernández en el lote" }));
    expect(within(dialog).queryByText(OUTDATED)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Marcar como enviadas" }));
    await waitFor(() => expect(createCredentialPrintBatch).toHaveBeenCalledTimes(1));
  });
});
