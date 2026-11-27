// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StaffMemberDialog from "@/app/components/festivals/credentials/staff-member-dialog";
import type { CredentialsResult } from "@/app/lib/credentials/definitions";

const createStaffMember = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({ createStaffMember, archiveStaffMember: vi.fn(), restoreStaffMember: vi.fn(), updateStaffMember: vi.fn(), }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StaffMemberDialog", () => {
  it("stays open while saving, so the result closes the session that started it", async () => {
    let finish!: (result: CredentialsResult) => void;
    createStaffMember.mockReturnValue(new Promise<CredentialsResult>((resolve) => (finish = resolve)));
    render(<StaffMemberDialog festivalId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nombre en la credencial"), { target: { value: "Daniela Arce" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createStaffMember).toHaveBeenCalledTimes(1));

    expect(within(dialog).getByRole("button", { name: "Cancelar" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);

    finish({ success: true, message: "Listo." });
    await waitFor(() => expect(screen.queryByText("Agregar persona al equipo")).toBeNull());
  });
});
