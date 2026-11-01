import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EmailFooter from "@/app/emails/email-footer";
import FestivalActivationEmailTemplate from "@/app/emails/festival-activation";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";

const URL = "https://www.glitter.com.bo/email/unsubscribe?token=abc.def";

describe("unsubscribe link in the footer", () => {
  it("is only there when the email is bulk mail", () => {
    expect(renderToStaticMarkup(EmailFooter({}))).not.toContain(
      "Darme de baja",
    );
    const html = renderToStaticMarkup(EmailFooter({ unsubscribeUrl: URL }));
    expect(html).toContain("Darme de baja");
    expect(html).toContain(`href="${URL}"`);
  });

  it("prints note lines above the unsubscribe line, and none when there are none", () => {
    const notes = [
      "Es un correo esencial sobre tu participación en Glitter 2026.",
      "Este correo salió del entorno de prueba de Glitter.",
    ];
    const html = renderToStaticMarkup(
      EmailFooter({ unsubscribeUrl: URL, notes }),
    );
    const first = html.indexOf(notes[0]!);
    const second = html.indexOf(notes[1]!);
    expect(first).toBeGreaterThan(html.indexOf("Productora Glitter, Santa"));
    expect(second).toBeGreaterThan(first);
    expect(html.indexOf("¿No querés recibir más correos")).toBeGreaterThan(
      second,
    );

    // Notes do not need an unsubscribe link, e.g. on a test send.
    expect(renderToStaticMarkup(EmailFooter({ notes }))).toContain(notes[1]);

    const paragraphs = (markup: string) => markup.match(/<p\b/g)?.length ?? 0;
    const without = paragraphs(
      renderToStaticMarkup(EmailFooter({ unsubscribeUrl: URL })),
    );
    expect(
      paragraphs(
        renderToStaticMarkup(EmailFooter({ unsubscribeUrl: URL, notes: [] })),
      ),
    ).toBe(without);
    expect(paragraphs(html)).toBe(without + notes.length);
  });

  it("reaches both invitation emails", () => {
    const visitor = renderToStaticMarkup(
      RegistrationInvitationEmailTemplate({
        ...RegistrationInvitationEmailTemplate.PreviewProps,
        unsubscribeUrl: URL,
      }),
    );
    const participant = renderToStaticMarkup(
      FestivalActivationEmailTemplate({
        ...FestivalActivationEmailTemplate.PreviewProps,
        unsubscribeUrl: URL,
      }),
    );
    expect(visitor).toContain(`href="${URL}"`);
    expect(participant).toContain(`href="${URL}"`);
  });
});
