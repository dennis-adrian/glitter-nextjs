// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DuplicateListDialog from "@/app/components/communications/admin/duplicate-list-dialog";

const mocks = vi.hoisted(() => ({
  duplicate: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/distribution_lists/actions", () => ({
  duplicateDistributionListAction: mocks.duplicate,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

describe("DuplicateListDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("explains the frozen copy, suggests a name, and opens the copy", async () => {
    mocks.duplicate.mockResolvedValue({
      success: true,
      message: "Copiamos 2 personas de «Confirmados · Glitter».",
      listId: 41,
    });
    const onOpenChange = vi.fn();
    render(
      <DuplicateListDialog
        list={{
          source: { kind: "festival", festivalId: 7 },
          name: "Confirmados · Glitter",
          dynamic: true,
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByText(/no se suman solos/)).toBeTruthy();
    const name = screen.getByLabelText("Nombre de la copia");
    expect((name as HTMLInputElement).value).toBe(
      "Copia de Confirmados · Glitter",
    );
    fireEvent.change(name, { target: { value: "  Navidad a mano " } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));

    await waitFor(() =>
      expect(mocks.duplicate).toHaveBeenCalledWith({
        source: { kind: "festival", festivalId: 7 },
        name: "Navidad a mano",
      }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/communications/lists/41",
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open on a refusal", async () => {
    mocks.duplicate.mockResolvedValue({
      success: false,
      message: "Ya hay una lista con ese nombre. Elegí otro.",
    });
    const onOpenChange = vi.fn();
    render(
      <DuplicateListDialog
        list={{
          source: { kind: "list", listId: 3 },
          name: "Ilustradores",
          dynamic: false,
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );
    expect(screen.queryByText(/no se suman solos/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Ya hay una lista con ese nombre. Elegí otro.",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
