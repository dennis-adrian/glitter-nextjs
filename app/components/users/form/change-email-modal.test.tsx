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
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
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

  it("keeps a result that needs follow-up on screen until dismissed", async () => {
    changeUserEmail.mockResolvedValueOnce({
      success: true,
      message: "Correo actualizado.",
      description: "El correo anterior todavía sirve para entrar.",
      needsFollowUp: true,
    });
    const setOpen = open();
    fill("ana.nueva@example.com");
    submit();

    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
    expect(toast.warning).toHaveBeenCalledWith("Correo actualizado.", {
      description: "El correo anterior todavía sirve para entrar.",
      duration: Infinity,
      closeButton: true,
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("accepts the current address, which re-syncs the account", async () => {
    open();
    expect(screen.getByText(/Si repetís el correo actual/)).toBeTruthy();
    fill(CURRENT);
    submit();

    await waitFor(() =>
      expect(changeUserEmail).toHaveBeenCalledWith({
        userId: 7,
        email: CURRENT,
      }),
    );
  });

  it("says that open sessions are closed", () => {
    open();

    expect(
      screen.getByText(
        /Se cierran las sesiones que tenga abiertas, así que va a tener que volver a entrar/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/siguen abiertas/)).toBeNull();
  });

  it("mounts the form only while open, so nothing typed survives a close", () => {
    const props = { profile: { id: 7, email: CURRENT } as never, setOpen() {} };
    const { rerender } = render(<ChangeEmailModal open {...props} />);
    fill("a.medias@example.com");

    rerender(<ChangeEmailModal open={false} {...props} />);
    expect(screen.queryByLabelText("Correo nuevo")).toBeNull();

    rerender(<ChangeEmailModal open {...props} />);
    expect(
      (screen.getByLabelText("Correo nuevo") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Repetí el correo nuevo") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("starts over for another profile behind the same dialog", () => {
    const setOpen = vi.fn();
    const { rerender } = render(
      <ChangeEmailModal
        open
        profile={{ id: 7, email: CURRENT } as never}
        setOpen={setOpen}
      />,
    );
    fill("a.medias@example.com");

    rerender(
      <ChangeEmailModal
        open
        profile={{ id: 8, email: "otra@example.com" } as never}
        setOpen={setOpen}
      />,
    );

    expect(
      (screen.getByLabelText("Correo nuevo") as HTMLInputElement).value,
    ).toBe("");
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
