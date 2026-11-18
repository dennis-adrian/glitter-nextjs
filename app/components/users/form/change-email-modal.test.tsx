// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChangeUserEmailResult } from "@/app/lib/users/email-change-definitions";

vi.mock("server-only", () => ({}));

const { changeUserEmail, refresh, toast } = vi.hoisted(() => ({
  changeUserEmail: vi.fn(
    async (): Promise<ChangeUserEmailResult> => ({
      success: true,
      message: "Correo cambiado.",
    }),
  ),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/lib/users/email-change-actions", () => ({ changeUserEmail }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
// The dialog picks its layout from a media query jsdom does not implement.
vi.mock("@/app/hooks/use-media-query", () => ({ useMediaQuery: () => true }));

import { ChangeEmailModal } from "@/app/components/users/form/change-email-modal";

const CURRENT = "ana.anterior@example.com";

function open() {
  const setOpen = vi.fn();
  render(
    <ChangeEmailModal
      open
      profile={{ id: 7, email: CURRENT } as never}
      setOpen={setOpen}
    />,
  );
  return setOpen;
}

function fill(email: string, confirmEmail = email) {
  fireEvent.change(screen.getByLabelText("Correo nuevo"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Repetí el correo nuevo"), {
    target: { value: confirmEmail },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Cambiar correo" }));
}

describe("ChangeEmailModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the address being replaced", () => {
    open();

    expect(screen.getByText(CURRENT)).toBeTruthy();
  });

  it("refuses two addresses that differ", async () => {
    // Typing it twice is the only check there is: nothing verifies the address.
    open();
    fill("ana@example.com", "anna@example.com");
    submit();

    expect(await screen.findByText("Los correos no coinciden")).toBeTruthy();
    expect(changeUserEmail).not.toHaveBeenCalled();
  });

  it("refuses something that is not an address", async () => {
    open();
    fill("ana-sin-arroba");
    submit();

    expect(await screen.findByText("El correo no es válido")).toBeTruthy();
    expect(changeUserEmail).not.toHaveBeenCalled();
  });

  it("sends the address trimmed and lowercased", async () => {
    open();
    fill("  Ana.Nueva@Example.COM ", "ana.nueva@example.com");
    submit();

    await waitFor(() => expect(changeUserEmail).toHaveBeenCalled());
    expect(changeUserEmail).toHaveBeenCalledWith({
      userId: 7,
      email: "ana.nueva@example.com",
    });
  });

  it("shows why the change was refused and stays open", async () => {
    changeUserEmail.mockResolvedValueOnce({
      success: false,
      message: "Ese correo ya pertenece a otra cuenta.",
    });
    const setOpen = open();
    fill("ana.nueva@example.com");
    submit();

    expect(
      await screen.findByText("Ese correo ya pertenece a otra cuenta."),
    ).toBeTruthy();
    expect(setOpen).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("confirms, closes and refreshes once the change went through", async () => {
    changeUserEmail.mockResolvedValueOnce({
      success: true,
      message: "Correo cambiado.",
      description: "Se desvinculó su cuenta de Google.",
    });
    const setOpen = open();
    fill("ana.nueva@example.com");
    submit();

    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Correo cambiado.", {
      description: "Se desvinculó su cuenta de Google.",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("does not close while the change is still running", async () => {
    // The action makes several calls to Clerk; closing halfway would hide how
    // it ended.
    let finish: (result: ChangeUserEmailResult) => void = () => {};
    changeUserEmail.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const setOpen = open();
    fill("ana.nueva@example.com");
    submit();
    await waitFor(() => expect(changeUserEmail).toHaveBeenCalled());

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(setOpen).not.toHaveBeenCalled();

    finish({ success: true, message: "Correo cambiado." });
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
  });

  it("reports a call that threw without closing", async () => {
    changeUserEmail.mockRejectedValueOnce(new Error("network"));
    const setOpen = open();
    fill("ana.nueva@example.com");
    submit();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(setOpen).not.toHaveBeenCalled();
  });
});
