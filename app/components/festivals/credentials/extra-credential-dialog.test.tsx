// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExtraCredentialDialog from "@/app/components/festivals/credentials/extra-credential-dialog";
import type { CredentialsResult } from "@/app/lib/credentials/definitions";

const addExtraCredential = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/credentials/actions", () => ({ addExtraCredential, updateExtraCredential: vi.fn(), }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  // The radio group measures itself.
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ExtraCredentialDialog", () => {
  it("stays open while saving, so the result closes the session that started it", async () => {
    let finish!: (result: CredentialsResult) => void;
    addExtraCredential.mockReturnValue(new Promise<CredentialsResult>((resolve) => (finish = resolve)));
    render(<ExtraCredentialDialog festivalId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar credencial" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nombre en la credencial"), { target: { value: "Ana Paz" } });
    fireEvent.change(within(dialog).getByLabelText("Para qué es"), { target: { value: "Fotografía" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(addExtraCredential).toHaveBeenCalledTimes(1));

    expect(within(dialog).getByRole("button", { name: "Cancelar" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);

    finish({ success: true, message: "Listo." });
    await waitFor(() => expect(screen.queryByText("Agregar credencial para esta edición")).toBeNull());
  });
});
