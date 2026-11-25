// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CredentialsTeamView from "@/app/components/festivals/credentials/credentials-team-view";
import { renderWithCredentials } from "@/app/components/festivals/credentials/test-utils";
import { addExternal, emptyData } from "@/app/lib/credentials/__fixtures__/data";

const setFestivalStaffMember = vi.hoisted(() => vi.fn());
const setExternalCredentialQuantity = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({
  setFestivalStaffMember,
  setExternalCredentialQuantity,
  removeExtraCredential: vi.fn(),
  createStaffMember: vi.fn(),
  updateStaffMember: vi.fn(),
  archiveStaffMember: vi.fn(),
  restoreStaffMember: vi.fn(),
  addExtraCredential: vi.fn(),
  updateExtraCredential: vi.fn(),
}));
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

describe("CredentialsTeamView", () => {
  it("lists the roster with this edition's ticks, archived members marked", () => {
    renderWithCredentials(<CredentialsTeamView />, { data: festival(), tab: "equipo" });
    expect(screen.getByText(/Marcá quiénes trabajan en esta: 2 de 2/)).toBeTruthy();
    expect(screen.getByText("Archivada")).toBeTruthy();
    const archived = screen.getByRole("checkbox", { name: "Incluir a Carla Montaño en esta edición" });
    // Selected, so it can still be unticked.
    expect(archived.hasAttribute("disabled")).toBe(false);
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
});
