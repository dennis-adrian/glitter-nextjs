// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/lib/notifications/admin-resend-actions", () => ({
  resendFailedNotificationEmailAction: mocks.action,
}));

import { NotificationLogResendCell } from "@/app/components/notifications/admin/notification-log-resend";
import type { NotificationLogRow } from "@/app/lib/notifications/admin-log-definitions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function row(overrides: Partial<NotificationLogRow> = {}): NotificationLogRow {
  return {
    key: "delivery:7",
    source: "delivery",
    id: 7,
    channel: "email",
    status: "failed",
    kind: "credit_gift_received",
    title: "Te regalaron créditos",
    reserved: false,
    recipient: { userId: 12, name: "Lola Pérez", email: "lola@example.test" },
    deviceLabel: null,
    deviceRemoved: false,
    lane: "transactional",
    attempts: 5,
    error: "resend:application_error",
    createdAt: new Date("2026-11-10T14:00:00Z"),
    sentAt: null,
    readAt: null,
    retractedAt: null,
    isResend: false,
    links: [],
    resend: { eligible: true, requestedBy: null, resentAs: null },
    ...overrides,
  };
}

describe("NotificationLogResendCell", () => {
  it("shows nothing on a row with nothing to say", () => {
    const { container } = render(
      <NotificationLogResendCell
        row={row({
          status: "sent",
          resend: { eligible: false, requestedBy: null, resentAs: null },
        })}
      />,
    );
    expect(container.textContent).toBe("");
    render(<NotificationLogResendCell row={row({ resend: undefined })} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks before resending, naming the person, the address and what goes", async () => {
    mocks.action.mockResolvedValue({ success: true, message: "Listo" });
    render(<NotificationLogResendCell row={row()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Reenviar correo a Lola Pérez" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Lola Pérez");
    expect(dialog.textContent).toContain("lola@example.test");
    expect(dialog.textContent).toContain("Regalo de créditos");
    expect(dialog.textContent).toContain("Te regalaron créditos");
    expect(mocks.action).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    await vi.waitFor(() =>
      expect(mocks.action).toHaveBeenCalledWith({ deliveryId: 7 }),
    );
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("keeps a disciplinary notice's content out of the confirmation", async () => {
    render(
      <NotificationLogResendCell
        row={row({
          kind: "infraction_registered",
          reserved: true,
          title: null,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reenviar correo/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Contenido reservado");
  });

  it("says a row was resent, by whom and how it went, and offers no second resend", () => {
    render(
      <NotificationLogResendCell
        row={row({
          resend: {
            eligible: false,
            requestedBy: null,
            resentAs: {
              deliveryId: 8,
              status: "sent",
              at: new Date("2026-11-10T15:00:00Z"),
              by: { userId: 1, name: "Admin Ana" },
            },
          },
        })}
      />,
    );
    expect(screen.getByText(/por Admin Ana: aceptado por Resend/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says who asked for a resend row", () => {
    render(
      <NotificationLogResendCell
        row={row({
          status: "pending",
          isResend: true,
          resend: {
            eligible: false,
            requestedBy: { userId: 1, name: null },
            resentAs: null,
          },
        })}
      />,
    );
    expect(
      screen.getByText("Reenvío pedido por la cuenta #1."),
    ).toBeTruthy();
  });
});
