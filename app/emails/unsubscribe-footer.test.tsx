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
