// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import NotificationDetail from "@/app/components/notifications/notification-detail";
import { normalizeAnnouncementDoc } from "@/app/lib/comunicados/content";
import type { NotificationDetail as NotificationDetailData } from "@/app/lib/notifications/queries";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";

function detail(
  overrides: Partial<NotificationDetailData> = {},
): NotificationDetailData {
  return {
    id: 4,
    kind: "comunicado",
    category: "announcements",
    title: "Cambio de horario de armado",
    body: "El armado empieza a las 8:00. Mirá el mapa",
    actionPath: "/my_participations",
    actionLabel: "Ver mi reserva",
    creditDelta: null,
    opensDetail: true,
    readAt: null,
    createdAt: "2026-10-24T22:02:00.000Z",
    editedAt: null,
    message: null,
    bodyHtml: null,
    ...overrides,
  };
}

function text(value: string) {
  return { type: "text", text: value, styles: {} };
}

/** A revision's `html` as the send writes it (D1): normalized, then rendered. */
async function storedHtml() {
  const normalized = normalizeAnnouncementDoc(
    [
      {
        type: "heading",
        props: { level: 2 },
        content: [text("Horario de armado")],
      },
      {
        type: "paragraph",
        props: {},
        content: [
          text("El armado empieza a las 8:00. Mirá "),
          {
            type: "link",
            href: "https://maps.example.com/glitter",
            content: [text("el mapa")],
          },
        ],
      },
    ],
    { stage: "send" },
  );
  if (!normalized.ok) throw new Error(normalized.message);
  return blocksToSanitizedHtml(normalized.blocks, "announcement");
}

afterEach(cleanup);

describe("NotificationDetail", () => {
  it("shows a comunicado's text as written, its links opening apart", async () => {
    render(
      <NotificationDetail
        notification={detail({ bodyHtml: await storedHtml() })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Horario de armado" }),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "el mapa" });
    expect(link.getAttribute("href")).toBe("https://maps.example.com/glitter");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    // The rendered text replaces the plain excerpt, not adds to it.
    expect(
      screen.queryByText("El armado empieza a las 8:00. Mirá el mapa"),
    ).toBeNull();
    // The one action stays below it, with no sign-off.
    expect(
      screen.getByRole("link", { name: "Ver mi reserva" }).getAttribute("href"),
    ).toBe("/my_participations");
  });

  it("shows the plain text when there is no rendered body", () => {
    render(
      <NotificationDetail
        notification={detail({
          kind: "credit_gift_received",
          category: "credits",
          title: "Recibiste 20 créditos de regalo",
          body: "Gracias por…",
          message: "Gracias por estar en Glitter Navidad.\nNos vemos pronto.",
          creditDelta: 20,
        })}
      />,
    );

    expect(
      screen.getByText(/Gracias por estar en Glitter Navidad\.\s+Nos vemos/),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("falls back to the plain body when a comunicado's HTML is missing or blank", () => {
    const { rerender } = render(<NotificationDetail notification={detail()} />);
    expect(
      screen.getByText("El armado empieza a las 8:00. Mirá el mapa"),
    ).toBeTruthy();

    rerender(<NotificationDetail notification={detail({ bodyHtml: "  " })} />);
    expect(
      screen.getByText("El armado empieza a las 8:00. Mirá el mapa"),
    ).toBeTruthy();
  });

  it("says when it was edited, and only then", () => {
    const { rerender } = render(<NotificationDetail notification={detail()} />);
    expect(screen.queryByText(/Editado/)).toBeNull();

    rerender(
      <NotificationDetail
        notification={detail({ editedAt: "2026-10-25T14:12:00.000Z" })}
      />,
    );
    // Bolivia time, UTC-4.
    expect(screen.getByText("Editado el 25 de octubre, 10:12 AM")).toBeTruthy();
    expect(screen.getByText("Anuncios · 24 oct 2026, 6:02 PM")).toBeTruthy();
  });
});
