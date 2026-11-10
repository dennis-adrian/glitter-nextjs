// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  RecipientCell,
  StatusCell,
  WhatCell,
} from "@/app/components/notifications/admin/notification-log-table";
import type { NotificationLogRow } from "@/app/lib/notifications/admin-log-definitions";

afterEach(cleanup);

function row(overrides: Partial<NotificationLogRow> = {}): NotificationLogRow {
  return {
    key: "delivery:1",
    source: "delivery",
    id: 1,
    channel: "email",
    status: "sent",
    kind: "comunicado",
    title: "Cambio de horario",
    reserved: false,
    recipient: { userId: 12, name: "Lola Pérez", email: "lola@example.test" },
    deviceLabel: null,
    deviceRemoved: false,
    lane: "transactional",
    attempts: 1,
    error: null,
    createdAt: new Date("2026-11-10T14:00:00Z"),
    sentAt: new Date("2026-11-10T14:00:05Z"),
    readAt: null,
    retractedAt: null,
    isResend: false,
    links: [],
    ...overrides,
  };
}

describe("notification log cells", () => {
  it("links the person to their account and shows the address", () => {
    render(<RecipientCell row={row()} />);
    expect(screen.getByRole("link", { name: "Lola Pérez" })).toHaveProperty(
      "pathname",
      "/dashboard/users/12",
    );
    expect(screen.getByText("lola@example.test")).toBeTruthy();
  });

  it("says when there is no account, and names a push's device", () => {
    render(
      <RecipientCell
        row={row({
          channel: "push",
          recipient: { userId: null, name: null, email: null },
          deviceLabel: "iPhone",
        })}
      />,
    );
    expect(screen.getByText("Sin cuenta")).toBeTruthy();
    expect(screen.getByText("iPhone")).toBeTruthy();
  });

  it("shows the kind, the title and the campaign link", () => {
    render(
      <WhatCell
        row={row({
          links: [
            {
              label: "Ver reporte del comunicado",
              href: "/dashboard/communications/3",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Comunicado")).toBeTruthy();
    expect(screen.getByText("Cambio de horario")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver reporte del comunicado" }),
    ).toHaveProperty("pathname", "/dashboard/communications/3");
  });

  it("withholds a disciplinary notice's content", () => {
    render(
      <WhatCell
        row={row({
          kind: "infraction_registered",
          reserved: true,
          title: null,
        })}
      />,
    );
    expect(screen.getByText("Infracción registrada")).toBeTruthy();
    expect(screen.getByText(/Contenido reservado/)).toBeTruthy();
  });

  it("labels sent as accepted, and shows a failure's error", () => {
    const { rerender } = render(<StatusCell row={row()} />);
    expect(screen.getByText("Aceptado por Resend")).toBeTruthy();

    rerender(
      <StatusCell
        row={row({ status: "failed", attempts: 3, error: "resend 500" })}
        fullError
      />,
    );
    expect(screen.getByText("Falló")).toBeTruthy();
    expect(screen.getByText("3 intentos")).toBeTruthy();
    expect(screen.getByText("resend 500")).toBeTruthy();
  });

  it("tells read from unread and retracted inbox items", () => {
    const { rerender } = render(
      <StatusCell row={row({ channel: "in_app", readAt: new Date() })} />,
    );
    expect(screen.getByText("En la bandeja")).toBeTruthy();
    expect(screen.getByText("Leído")).toBeTruthy();
    rerender(
      <StatusCell row={row({ channel: "in_app", retractedAt: new Date() })} />,
    );
    expect(screen.getByText("Retirado")).toBeTruthy();
  });
});
