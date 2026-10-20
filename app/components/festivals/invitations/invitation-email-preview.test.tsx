import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/festivals/invitations", () => ({
  previewInvitationEmail: vi.fn(),
}));

import InvitationEmailPreview from "@/app/components/festivals/invitations/invitation-email-preview";
import { previewInvitationEmail } from "@/app/lib/festivals/invitations";

const preview = vi.mocked(previewInvitationEmail);

afterEach(cleanup);
beforeEach(() => preview.mockReset());

describe("InvitationEmailPreview", () => {
  it("renders the email only once asked, in a frame that runs no scripts", async () => {
    preview.mockResolvedValue({
      success: true,
      from: "Equipo Glitter <equipo@productoraglitter.com>",
      subject: "Entrada libre a Glitter: registrate y evitá la fila",
      html: '<html><head><meta charset="utf-8"></head><body><a href="https://x.test">Registrarme gratis</a></body></html>',
    });
    render(
      <InvitationEmailPreview festivalId={7} kind="visitor_registration" />,
    );
    expect(preview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Ver el correo/ }));

    expect(
      await screen.findByText(
        "Entrada libre a Glitter: registrate y evitá la fila",
      ),
    ).toBeTruthy();
    expect(preview).toHaveBeenCalledWith(7, "visitor_registration");
    const frame = screen.getByTitle(/Vista previa/) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain(
      '<head><base target="_blank"><meta charset="utf-8">',
    );
  });

  it("keeps the rendered email when hidden and shown again", async () => {
    preview.mockResolvedValue({
      success: true,
      from: "a@b.test",
      subject: "Asunto de prueba",
      html: "<p>hola</p>",
    });
    render(
      <InvitationEmailPreview festivalId={7} kind="participant_activation" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ver el correo/ }));
    await screen.findByText("Asunto de prueba");
    fireEvent.click(screen.getByRole("button", { name: /Ocultar el correo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver el correo/ }));

    expect(await screen.findByText("Asunto de prueba")).toBeTruthy();
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("says why it failed and lets the admin try again", async () => {
    preview
      .mockResolvedValueOnce({ success: false, message: "No autorizado" })
      .mockResolvedValueOnce({
        success: true,
        from: "a@b.test",
        subject: "Asunto de prueba",
        html: "<p>hola</p>",
      });
    render(
      <InvitationEmailPreview festivalId={7} kind="visitor_registration" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ver el correo/ }));
    expect(await screen.findByText("No autorizado")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Asunto de prueba")).toBeTruthy();
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it("cannot be opened while a send is running", () => {
    render(
      <InvitationEmailPreview
        festivalId={7}
        kind="visitor_registration"
        disabled
      />,
    );
    const button = screen.getByRole("button", { name: /Ver el correo/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
