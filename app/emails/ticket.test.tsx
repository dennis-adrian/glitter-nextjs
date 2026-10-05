import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TicketEmailTemplate from "@/app/emails/ticket";

function render() {
  return renderToStaticMarkup(
    TicketEmailTemplate(TicketEmailTemplate.PreviewProps),
  );
}

describe("TicketEmailTemplate", () => {
  /**
   * The alt text is what a client shows while images are blocked. The QR
   * defenses against Android dark mode (cid image, light-only metas) stay put.
   */
  it("describes the QR code for a reader who cannot see it", () => {
    const html = render();

    expect(html).toContain('alt="Código QR de tu entrada"');
    expect(html).not.toContain("codigo qr");
    expect(html).toContain('src="cid:ticket-qrcode"');
    expect(html).toContain('content="only light"');
  });

  it("ends each sentence with a period", () => {
    const html = render();

    expect(html).toContain("Max el Caimán</strong>.");
    expect(html).toContain("para poder ingresar al evento.");
    expect(html).toContain("descargar tu entrada.");
  });

  it("tells a reader who cannot see the code what to do, in voseo", () => {
    expect(render()).toContain(
      "Si tenés problemas para ver el código, hacé clic en el botón e ingresá con tu correo electrónico para descargar tu entrada.",
    );
  });
});
