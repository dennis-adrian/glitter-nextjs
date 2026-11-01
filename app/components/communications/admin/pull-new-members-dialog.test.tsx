// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PullNewMembersDialog from "@/app/components/communications/admin/pull-new-members-dialog";
import type { DistributionListMember } from "@/app/lib/distribution_lists/definitions";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  pull: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/lib/distribution_lists/actions", () => ({
  previewDistributionListPullAction: mocks.preview,
  pullDistributionListMembersAction: mocks.pull,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

function person(id: number): DistributionListMember {
  return {
    userId: id,
    name: `Persona ${id}`,
    email: `p${id}@example.com`,
    imageUrl: null,
    skipReason: null,
  };
}

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <PullNewMembersDialog
      listId={9}
      originName="Confirmados · Glitter"
      open
      onOpenChange={onOpenChange}
    />,
  );
  return { onOpenChange };
}

describe("PullNewMembersDialog", () => {
  beforeEach(() => {
    mocks.pull.mockResolvedValue({
      success: true,
      message: "Agregamos 1 persona de «Confirmados · Glitter».",
      added: 1,
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers the newcomers all ticked, and adds only those left ticked", async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      originName: "Confirmados · Glitter",
      candidates: [person(1), person(2)],
      removed: [person(3), person(4)],
    });
    const { onOpenChange } = renderDialog();

    expect(
      (
        await screen.findByRole("checkbox", { name: "Agregar a Persona 1" })
      ).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Agregar a Persona 2" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    // Removed by hand: not offered, only counted.
    expect(screen.queryByText("Persona 3")).toBeNull();
    expect(screen.getByText("2 quitados a mano no se agregan")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Agregar a Persona 2" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 persona" }));

    await waitFor(() =>
      expect(mocks.pull).toHaveBeenCalledWith({
        listId: 9,
        userIds: [1],
        includeRemoved: false,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.success).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("includes those removed by hand only when asked", async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      originName: "Confirmados · Glitter",
      candidates: [],
      removed: [person(3)],
    });
    renderDialog();

    const include = await screen.findByRole("checkbox", {
      name: /1 quitado a mano no se agrega/,
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Agregar 0 personas",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(include);
    expect(
      screen
        .getByRole("checkbox", { name: "Agregar a Persona 3" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 persona" }));
    await waitFor(() =>
      expect(mocks.pull).toHaveBeenCalledWith({
        listId: 9,
        userIds: [3],
        includeRemoved: true,
      }),
    );
  });

  it("says when there is nobody new, and shows a refusal", async () => {
    mocks.preview.mockResolvedValueOnce({
      ok: true,
      originName: "Confirmados · Glitter",
      candidates: [],
      removed: [],
    });
    renderDialog();
    expect(
      await screen.findByText(
        "No hay nadie nuevo: todos los de «Confirmados · Glitter» ya están en esta lista.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar/ })).toBeNull();
    cleanup();

    mocks.preview.mockResolvedValueOnce({
      ok: false,
      message:
        "«Confirmados · Glitter» ya no existe: no hay de dónde traer nuevos.",
    });
    renderDialog();
    expect(
      await screen.findByText(
        "«Confirmados · Glitter» ya no existe: no hay de dónde traer nuevos.",
      ),
    ).toBeTruthy();
  });
});
