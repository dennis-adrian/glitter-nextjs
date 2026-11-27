// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CredentialsTeamView from "@/app/components/festivals/credentials/credentials-team-view";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addExternal, batch, emptyData } from "@/app/lib/credentials/__fixtures__/data";

const setFestivalStaffMember = vi.hoisted(() => vi.fn());
const setExternalCredentialQuantity = vi.hoisted(() => vi.fn());
const removeExtraCredential = vi.hoisted(() => vi.fn());
const restoreStaffMember = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/lib/credentials/actions", () => ({
  setFestivalStaffMember,
  setExternalCredentialQuantity,
  removeExtraCredential,
  createStaffMember: vi.fn(),
  updateStaffMember: vi.fn(),
  archiveStaffMember: vi.fn(),
  restoreStaffMember,
  addExtraCredential: vi.fn(),
  updateExtraCredential: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh }),
  usePathname: () => "/dashboard/festivals/1/credentials",
}));
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("sonner", () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // clearAllMocks keeps queued mockResolvedValueOnce answers: a test that
  // fails early must not hand its leftovers to the next one.
  removeExtraCredential.mockReset();
});

function festival() {
  const data = emptyData();
  data.staff.push(
    { id: 1, fullName: "Daniela Arce", roleLabel: "Dirección", isActive: true, selected: true },
    { id: 2, fullName: "Pablo Terán", roleLabel: "Sonido", isActive: true, selected: false },
    { id: 3, fullName: "Carla Montaño", roleLabel: "Diseño", isActive: false, selected: true },
  );
  addExternal(data, { externalId: 7, name: "Refugio Huellitas", stands: 2 });
  data.externalOverrides.push({ externalParticipantId: 7, quantity: 3, standsAtOverride: 1 });
  data.volunteerCounts = { accepted: 22, withoutRole: 3, waiting: 7 };
  return data;
}

/** One lot already sent to print and one named guest that was not. */
function withExtras() {
  const data = festival();
  data.extras.push(
    { id: 41, name: null, label: "Prensa", quantity: 6 },
    { id: 42, name: "Marcelo Peredo", label: "Fotografía", quantity: 1 },
  );
  data.batches.push(
    batch([
      {
        unitKey: "extra:41",
        group: "staff",
        userId: null,
        printedName: null,
        detail: "Prensa",
        namedCount: 0,
        unnamedCount: 6,
        isReprint: false,
      },
    ]),
  );
  return data;
}

describe("CredentialsTeamView", () => {
  it("lists the roster with this edition's ticks, archived members marked", () => {
    renderWithCredentials(<CredentialsTeamView />, { data: festival(), tab: "equipo" });
    // Carla is archived but still selected: she is in the list and the count.
    expect(screen.getByText(/Marcá quiénes trabajan en esta: 2 de 3/)).toBeTruthy();
    expect(screen.getByText("Archivada")).toBeTruthy();
    const archived = screen.getByRole("checkbox", { name: "Incluir a Carla Montaño en esta edición" });
    // Selected, so it can still be unticked.
    expect(archived.hasAttribute("disabled")).toBe(false);
  });

  it("never counts more selected than the roster shows", () => {
    const data = emptyData();
    data.staff.push({
      id: 3,
      fullName: "Carla Montaño",
      roleLabel: "Diseño",
      isActive: false,
      selected: true,
    });
    renderWithCredentials(<CredentialsTeamView />, { data, tab: "equipo" });
    expect(screen.getByText(/Marcá quiénes trabajan en esta: 1 de 1\./)).toBeTruthy();
  });

  it("lists archived members not selected here apart, with only a restore button", async () => {
    restoreStaffMember.mockResolvedValue({
      success: true,
      message: "La persona volvió a la lista del equipo.",
    });
    const data = festival();
    data.archivedStaff.push({ id: 9, fullName: "Rocío Vargas", roleLabel: "Logística" });
    renderWithCredentials(<CredentialsTeamView />, { data, tab: "equipo" });
    // Not in the roster nor its count.
    expect(screen.getByText(/Marcá quiénes trabajan en esta: 2 de 3/)).toBeTruthy();
    expect(screen.getByText("Archivadas (1)")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Rocío Vargas/ })).toBeNull();
    const archived = screen.getByRole("list", { name: "Archivadas" });
    expect(within(archived).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(archived).getByRole("button", { name: "Restaurar a Rocío Vargas" }));
    await waitFor(() =>
      expect(restoreStaffMember).toHaveBeenCalledWith({ festivalId: 1, staffMemberId: 9 }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("La persona volvió a la lista del equipo.");
  });

  it("hides the archived list when there is nobody in it", () => {
    renderWithCredentials(<CredentialsTeamView />, { data: festival(), tab: "equipo" });
    expect(screen.queryByText(/Archivadas \(/)).toBeNull();
  });

  it("says volunteers without a role still count", () => {
    renderWithCredentials(<CredentialsTeamView />, { data: festival(), tab: "equipo" });
    expect(
      screen.getByText(
        "Se toman solos de todas las postulaciones aceptadas, tengan rol o no: la credencial lleva el rol asignado o «Sin rol». Acá no hay nada que cargar.",
      ),
    ).toBeTruthy();
  });

  it("ticks someone for the edition at once", async () => {
    setFestivalStaffMember.mockResolvedValue({ success: true, message: "ok" });
    renderWithCredentials(<CredentialsTeamView />, { data: festival(), tab: "equipo" });
    const pablo = screen.getByRole("checkbox", { name: "Incluir a Pablo Terán en esta edición" });
    fireEvent.click(pablo);
    await waitFor(() =>
      expect(setFestivalStaffMember).toHaveBeenCalledWith({
        festivalId: 1,
        staffMemberId: 2,
        selected: true,
      }),
    );
  });

  it("shows an external's total, flags a stand change and saves on blur", async () => {
    setExternalCredentialQuantity.mockResolvedValue({ success: true, message: "ok" });
    renderWithCredentials(<CredentialsTeamView />, { data: festival(), tab: "equipo" });
    expect(screen.getByText("Cambió la cantidad de espacios")).toBeTruthy();
    const field = screen.getByLabelText("Credenciales para Refugio Huellitas") as HTMLInputElement;
    expect(field.value).toBe("3");
    expect(field.placeholder).toBe("4");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(setExternalCredentialQuantity).toHaveBeenCalledWith({
        festivalId: 1,
        externalParticipantId: 7,
        quantity: null,
      }),
    );
    expect(screen.getByText("3 sin rol")).toBeTruthy();
  });

  it("removes an extra nobody printed without asking", async () => {
    removeExtraCredential.mockResolvedValue({ success: true, message: "Credencial quitada." });
    renderWithCredentials(<CredentialsTeamView />, { data: withExtras(), tab: "equipo" });
    const button = screen.getByRole("button", { name: "Quitar Marcelo Peredo" });
    // A plain button: nothing announces a dialog that will not open.
    expect(button.getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Credencial quitada."));
    expect(removeExtraCredential).toHaveBeenCalledTimes(1);
    expect(removeExtraCredential).toHaveBeenCalledWith({
      festivalId: 1,
      extraCredentialId: 42,
      confirmPrinted: false,
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("warns before removing a printed extra and sends the confirmation", async () => {
    removeExtraCredential.mockResolvedValue({ success: true, message: "Credencial quitada." });
    renderWithCredentials(<CredentialsTeamView />, { data: withExtras(), tab: "equipo" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Prensa" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Ya se mandó a imprenta.");
    expect(removeExtraCredential).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
    await waitFor(() =>
      expect(removeExtraCredential).toHaveBeenCalledWith({
        festivalId: 1,
        extraCredentialId: 41,
        confirmPrinted: true,
      }),
    );
    expect(removeExtraCredential).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Credencial quitada."));
  });

  /** This screen's history predates a batch that printed it: the server asks. */
  it("opens the warning when the server says the extra was printed meanwhile", async () => {
    removeExtraCredential
      .mockResolvedValueOnce({
        success: false,
        message: "Esa credencial ya se mandó a imprenta.",
        needsConfirmation: true,
      })
      .mockResolvedValueOnce({ success: true, message: "Credencial quitada." });
    renderWithCredentials(<CredentialsTeamView />, { data: withExtras(), tab: "equipo" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Marcelo Peredo" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Quitar Marcelo Peredo?");
    expect(removeExtraCredential).toHaveBeenLastCalledWith({
      festivalId: 1,
      extraCredentialId: 42,
      confirmPrinted: false,
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
    await waitFor(() =>
      expect(removeExtraCredential).toHaveBeenLastCalledWith({
        festivalId: 1,
        extraCredentialId: 42,
        confirmPrinted: true,
      }),
    );
    expect(removeExtraCredential).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Credencial quitada."));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the entry and shows why when the server refuses", async () => {
    removeExtraCredential.mockResolvedValue({
      success: false,
      message: "No encontramos esa credencial. Actualizá la página.",
    });
    renderWithCredentials(<CredentialsTeamView />, { data: withExtras(), tab: "equipo" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Marcelo Peredo" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No encontramos esa credencial. Actualizá la página.",
      ),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
