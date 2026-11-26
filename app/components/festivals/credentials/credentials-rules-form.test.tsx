// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CredentialsRulesForm from "@/app/components/festivals/credentials/credentials-rules-form";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addReservation, emptyData } from "@/app/lib/credentials/__fixtures__/data";

const saveCredentialRules = vi.hoisted(() => vi.fn());
const resetCredentialRules = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({ saveCredentialRules, resetCredentialRules }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
});
