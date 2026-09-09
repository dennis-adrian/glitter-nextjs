import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/payments/forms/confirm-reservation-form", () => ({
  ConfirmReservationForm: () => <button>Confirmar reserva</button>,
}));

vi.mock("@/app/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";

afterEach(cleanup);

const invoice = {
  id: 9,
  status: "verification_payment" as const,
  amount: 370,
  payments: [
    {
      id: 3,
      voucherUrl: "https://files.example.com/voucher.png",
      fileKey: "uploadthing-key",
      createdAt: new Date("2026-09-05T10:00:00Z"),
    },
  ],
  reservation: { stand: { label: "B", standNumber: 35 } },
};

function renderModal() {
  return render(
    <ConfirmReservationModal
      // The component reads only these fields; the full row type is a large
      // relational shape this test has no reason to reproduce.
      invoice={invoice as never}
      show
      onOpenChange={() => {}}
    />,
  );
}

describe("ConfirmReservationModal", () => {
  it("says the cobro will be settled, because confirming always settles it", () => {
    renderModal();

    // applyAcceptedReservation sets invoices.status = 'paid' unconditionally,
    // so the dialog states it rather than offering it as a choice.
    expect(screen.getByRole("dialog").textContent).toContain(
      "el cobro quedará como pagado",
    );
  });

  it("offers no opt-out, since the engine cannot honour one", () => {
    renderModal();

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("dialog").textContent).not.toContain(
      "Marcar el pago como pagado",
    );
  });

  it("renders the comprobante inline, not as a trip to another tab", () => {
    renderModal();

    const proof = screen.getByAltText("Comprobante de pago");
    expect(proof.getAttribute("src")).toContain(
      encodeURIComponent("https://files.example.com/voucher.png"),
    );
  });

  it("holds the frame at a fixed height so nothing shifts when the image lands", () => {
    renderModal();

    const frame = screen.getByAltText("Comprobante de pago").parentElement!;
    // Sized by the container, not by the image's own ratio, so the dialog
    // measures the same before and after the fetch resolves.
    expect(frame.className).toContain("h-72");
    expect(frame.className).toContain("relative");
  });

  it("stops the skeleton even when the image fails, so it cannot pulse forever", () => {
    renderModal();

    const proof = screen.getByAltText("Comprobante de pago");
    expect(document.querySelector(".animate-pulse")).not.toBeNull();

    fireEvent.error(proof);
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("still offers the full-size original as a secondary way out", () => {
    renderModal();

    const link = screen.getByRole("link", { name: /Abrir en tamaño completo/ });
    expect(link.getAttribute("href")).toBe(
      "https://files.example.com/voucher.png",
    );
  });
});
