// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildPushPayload,
  MAX_PUSH_BODY_LENGTH,
  MAX_PUSH_TITLE_LENGTH,
  pushTopic,
  SENSITIVE_PUSH_BODY,
  SENSITIVE_PUSH_TITLE,
  WRITTEN_TEXT_PUSH_BODY,
} from "@/app/lib/notifications/push/payload";

const ITEM = {
  id: 41,
  title: "Tu reserva está confirmada",
  body: "Tu espacio B48 en Glitter ¡Feliz Cumple! está confirmado.",
  sensitive: false,
  writtenText: false,
};

function parse(payload: string) {
  return JSON.parse(payload) as Record<string, unknown>;
}

describe("buildPushPayload", () => {
  it("carries the inbox copy and opens the item's own page", () => {
    expect(parse(buildPushPayload(ITEM))).toEqual({
      v: 1,
      id: 41,
      title: ITEM.title,
      body: ITEM.body,
      url: "/my_notifications/41",
      tag: "notification-41",
    });
  });

  it("says only that something arrived for a disciplinary notice", () => {
    const payload = parse(
      buildPushPayload({
        ...ITEM,
        title: "Registramos una infracción",
        body: "El motivo registrado es «No se presentó».",
        sensitive: true,
      }),
    );
    expect(payload.title).toBe(SENSITIVE_PUSH_TITLE);
    expect(payload.body).toBe(SENSITIVE_PUSH_BODY);
    expect(JSON.stringify(payload)).not.toContain("infracción");
    expect(payload.url).toBe("/my_notifications/41");
  });

  it("keeps text someone wrote off the lock screen", () => {
    const payload = parse(
      buildPushPayload({
        ...ITEM,
        title: "Recibiste 20 créditos de regalo",
        body: "¡Gracias por acompañarnos todo el año, Ana!",
        writtenText: true,
      }),
    );
    expect(payload.title).toBe("Recibiste 20 créditos de regalo");
    expect(payload.body).toBe(WRITTEN_TEXT_PUSH_BODY);
  });

  it("sends only the first paragraph, where notes and reasons never are", () => {
    const payload = parse(
      buildPushPayload({
        ...ITEM,
        body: "Cancelamos tu reserva.\n\nMotivo: no se recibió el pago.",
      }),
    );
    expect(payload.body).toBe("Cancelamos tu reserva.");
  });

  it("cuts long copy by characters, never through an emoji", () => {
    const payload = parse(
      buildPushPayload({
        ...ITEM,
        title: "🎉".repeat(200),
        body: "ñ".repeat(500),
      }),
    );
    const title = Array.from(payload.title as string);
    const body = Array.from(payload.body as string);
    expect(title).toHaveLength(MAX_PUSH_TITLE_LENGTH);
    expect(title.at(-1)).toBe("…");
    expect(title.slice(0, -1).every((char) => char === "🎉")).toBe(true);
    expect(body).toHaveLength(MAX_PUSH_BODY_LENGTH);
  });

  it("stays well inside what every push service accepts", () => {
    const worst = buildPushPayload({
      ...ITEM,
      id: 2_147_483_647,
      // Control characters are escaped to six bytes each in JSON.
      title: "\u0001".repeat(500),
      body: "\u0002".repeat(5000),
    });
    expect(new TextEncoder().encode(worst).length).toBeLessThan(3000);
  });
});

describe("pushTopic", () => {
  it("is one per item, short and URL-safe as push services require", () => {
    const topic = pushTopic(2_147_483_647);
    expect(topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(pushTopic(1)).not.toBe(pushTopic(2));
  });
});
