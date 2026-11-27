// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CredentialsProvider } from "@/app/components/festivals/credentials/credentials-context";
import CredentialsRulesForm from "@/app/components/festivals/credentials/credentials-rules-form";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addReservation, emptyData } from "@/app/lib/credentials/__fixtures__/data";
import type { CredentialsData } from "@/app/lib/credentials/calculate";
import { DEFAULT_CREDENTIAL_FILTERS } from "@/app/lib/credentials/definitions";

const saveCredentialRules = vi.hoisted(() => vi.fn());
const resetCredentialRules = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({ saveCredentialRules, resetCredentialRules }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function festival() {
  const data = emptyData();
  addReservation(data, { people: [{ name: "Ilu" }] });
  addReservation(data, { category: "gastronomy", people: [{ name: "Cocina" }] });
  addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
  data.volunteers.push({ applicationId: 1, fullName: "Vol", roleName: null });
  return data;
}

/** The form under a provider whose data a test can swap, as a refresh does. */
function page(data: CredentialsData) {
  return (
    <CredentialsProvider
      festivalId={data.festival.id}
      tab="reglas"
      data={data}
      initialFilters={DEFAULT_CREDENTIAL_FILTERS}
      isAdmin
    >
      <CredentialsRulesForm />
    </CredentialsProvider>
  );
}

/** The same festival after another admin saved these rule rows. */
function refreshed(data: CredentialsData, ruleRows: CredentialsData["ruleRows"]) {
  return { ...data, ruleRows };
}

describe("CredentialsRulesForm", () => {
  it("previews the totals with the values being edited", () => {
    renderWithCredentials(<CredentialsRulesForm />, {
      data: festival(),
      tab: "reglas",
    });
    // 2 (illustration) + 2 (gastronomy) + 1 volunteer; the pending one is out.
    expect(screen.getByTestId("rules-preview-total").textContent).toBe("5");
    const [illustration] = screen.getAllByLabelText("Credenciales por espacio");
    fireEvent.change(illustration!, { target: { value: "4" } });
    expect(screen.getByTestId("rules-preview-total").textContent).toBe("7");
    expect(screen.getByText("Una reserva con 2 espacios recibe 8.")).toBeTruthy();
    expect(screen.getByText("Los participantes ven estas reglas")).toBeTruthy();
  });

  it("saves the rules with the button and refuses an out-of-range quantity", async () => {
    saveCredentialRules.mockResolvedValue({ success: true, message: "Reglas guardadas." });
    renderWithCredentials(<CredentialsRulesForm />, {
      data: festival(),
      tab: "reglas",
    });
    const volunteer = screen.getByLabelText("Voluntario aceptado");
    fireEvent.change(volunteer, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    expect(await screen.findByText("La cantidad puede ser como máximo 20.")).toBeTruthy();
    expect(saveCredentialRules).not.toHaveBeenCalled();

    fireEvent.change(volunteer, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    await waitFor(() => expect(saveCredentialRules).toHaveBeenCalledTimes(1));
    expect(saveCredentialRules.mock.calls[0]![0]).toMatchObject({
      festivalId: 1,
      rules: { volunteer: { quantity: 2 }, gastronomy: { quantity: 2, namingMode: "all_named" } },
    });
  });

  it("goes back to the defaults", async () => {
    resetCredentialRules.mockResolvedValue({ success: true, message: "Listo." });
    const data = festival();
    data.ruleRows.push({ group: "illustration", quantity: 5, namingMode: "none" });
    renderWithCredentials(<CredentialsRulesForm />, {
      data,
      tab: "reglas",
    });
    const [illustration] = screen.getAllByLabelText("Credenciales por espacio");
    expect((illustration as HTMLInputElement).value).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Volver a los valores por defecto" }));
    await waitFor(() => expect(resetCredentialRules).toHaveBeenCalledWith({ festivalId: 1 }));
    await waitFor(() => expect((illustration as HTMLInputElement).value).toBe("2"));
  });

  it("follows refreshed rules in untouched fields and keeps edited ones", async () => {
    const data = festival();
    const { rerender } = render(page(data));
    const volunteer = screen.getByLabelText("Voluntario aceptado") as HTMLInputElement;
    const staff = screen.getByLabelText("Persona del equipo Glitter") as HTMLInputElement;
    fireEvent.change(volunteer, { target: { value: "3" } });
    rerender(
      page(
        refreshed(data, [
          { group: "volunteer", quantity: 2, namingMode: "all_named" },
          { group: "staff", quantity: 4, namingMode: "all_named" },
        ]),
      ),
    );
    await waitFor(() => expect(staff.value).toBe("4"));
    expect(volunteer.value).toBe("3");
    expect(volunteer.getAttribute("aria-invalid")).toBe("false");
  });

  it("asks for review before saving a draft over newer saved rules", async () => {
    saveCredentialRules.mockResolvedValue({ success: true, message: "Reglas guardadas." });
    const data = festival();
    const { rerender } = render(page(data));
    const volunteer = screen.getByLabelText("Voluntario aceptado") as HTMLInputElement;
    fireEvent.change(volunteer, { target: { value: "3" } });
    rerender(
      page(refreshed(data, [{ group: "volunteer", quantity: 2, namingMode: "all_named" }])),
    );
    await waitFor(() => expect(toast.warning).not.toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringContaining("cambiaron las reglas guardadas"),
        expect.objectContaining({
          action: expect.objectContaining({ label: "Usar las guardadas" }),
        }),
      ),
    );
    expect(saveCredentialRules).not.toHaveBeenCalled();
    expect(volunteer.value).toBe("3");
    expect(volunteer.getAttribute("aria-invalid")).toBe("true");

    // The toast's action drops the draft for the newer saved value.
    const [, options] = vi.mocked(toast.warning).mock.calls[0]!;
    act(() => (options as { action: { onClick: () => void } }).action.onClick());
    await waitFor(() => expect(volunteer.value).toBe("2"));
    expect(volunteer.getAttribute("aria-invalid")).toBe("false");
  });

  it("saves a reviewed draft on the second try", async () => {
    saveCredentialRules.mockResolvedValue({ success: true, message: "Reglas guardadas." });
    const data = festival();
    const { rerender } = render(page(data));
    const volunteer = screen.getByLabelText("Voluntario aceptado");
    fireEvent.change(volunteer, { target: { value: "3" } });
    rerender(
      page(refreshed(data, [{ group: "volunteer", quantity: 2, namingMode: "all_named" }])),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    await waitFor(() => expect(saveCredentialRules).toHaveBeenCalledTimes(1));
    expect(saveCredentialRules.mock.calls[0]![0]).toMatchObject({
      rules: { volunteer: { quantity: 3 } },
    });
  });

  it("locks every field while saving or resetting", async () => {
    let finishSave!: (result: { success: boolean; message: string }) => void;
    saveCredentialRules.mockReturnValueOnce(new Promise((resolve) => (finishSave = resolve)));
    let finishReset!: (result: { success: boolean; message: string }) => void;
    resetCredentialRules.mockReturnValueOnce(new Promise((resolve) => (finishReset = resolve)));
    renderWithCredentials(<CredentialsRulesForm />, { data: festival(), tab: "reglas" });
    const volunteer = screen.getByLabelText("Voluntario aceptado");
    const [namingMode] = screen.getAllByRole("combobox");
    const locked = () => volunteer.matches(":disabled") && namingMode!.matches(":disabled");
    expect(locked()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    await waitFor(() => expect(saveCredentialRules).toHaveBeenCalledTimes(1));
    expect(locked()).toBe(true);
    await act(async () => finishSave({ success: true, message: "ok" }));
    await waitFor(() => expect(locked()).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Volver a los valores por defecto" }));
    await waitFor(() => expect(resetCredentialRules).toHaveBeenCalledTimes(1));
    expect(locked()).toBe(true);
    await act(async () => finishReset({ success: true, message: "ok" }));
    await waitFor(() => expect(locked()).toBe(false));
  });
});
