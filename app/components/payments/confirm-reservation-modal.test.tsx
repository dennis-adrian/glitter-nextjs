import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/payments/forms/confirm-reservation-form", () => ({
  ConfirmReservationForm: () => <button>Confirmar reserva</button>,
}));

vi.mock("@/app/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

// The viewer mounts react-zoom-pan-pinch, which needs a ResizeObserver jsdom
// does not have. Its own test polyfills that; this one only cares that the
// dialog hands it the right comprobante.
vi.mock("@/app/components/payments/voucher-viewer", () => ({
  default: ({ src }: { src: string }) => (
    <img alt="Comprobante de pago" src={src} />
  ),
}));

import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";

afterEach(cleanup);

const invoice = {
  id: 9,
  status: "verification_payment" as const,
  amount: 370,
  user: { displayName: "soychiiru" },
  payments: [
    {
      id: 3,
      // submitPaymentProof stamps the outstanding balance here, which is what
      // the comprobante was raised for — Bs20 of the Bs370 came from credits.
      amount: 350,
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

  it("names the figure the comprobante should show, not the whole cobro", () => {
    renderModal();

    const summary = screen.getByRole("dialog").querySelector("dl")!.textContent;
    // The reason this row exists: an admin checking a Bs350 voucher against a
    // Bs370 cobro would otherwise think it short.
    expect(summary).toContain("Debe decir el comprobante");
    expect(summary).toContain("Bs350");
    expect(summary).toContain("Ya cubierto");
    expect(summary).toContain("−Bs20");
  });

  it("names the holder, to check against the sending account", () => {
    renderModal();

    expect(
      screen.getByRole("dialog").querySelector("dl")!.textContent,
    ).toContain("soychiiru");
  });

  it("renders the comprobante inline, not as a trip to another tab", () => {
    renderModal();

    const proof = screen.getByAltText("Comprobante de pago");
    expect(proof.getAttribute("src")).toBe(
      "https://files.example.com/voucher.png",
    );
  });

  it("still offers the full-size original as a secondary way out", () => {
    renderModal();

    const link = screen.getByRole("link", { name: /Abrir en tamaño completo/ });
    expect(link.getAttribute("href")).toBe(
      "https://files.example.com/voucher.png",
    );
  });
});
