import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// react-zoom-pan-pinch measures its container on mount; jsdom has no
// ResizeObserver, and there is no global setup file to put this in.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

import VoucherViewer from "@/app/components/payments/voucher-viewer";

afterEach(cleanup);

const SRC = "https://files.example.com/voucher.png";

describe("VoucherViewer", () => {
  it("keeps the frame a fixed size, so loading or zooming shifts nothing", () => {
    const { container } = render(<VoucherViewer src={SRC} />);

    const frame = container.firstElementChild!;
    // The height comes from the frame, never from the image — a comprobante is
    // whatever shape the participant's phone screenshot was.
    expect(frame.className).toContain("h-72");
    expect(frame.className).toContain("overflow-hidden");
  });

  it("offers zoom and reset controls", () => {
    render(<VoucherViewer src={SRC} />);

    expect(screen.getByLabelText("Acercar el comprobante")).toBeDefined();
    expect(screen.getByLabelText("Alejar el comprobante")).toBeDefined();
    expect(screen.getByLabelText("Restablecer el zoom")).toBeDefined();
  });

  it("covers the frame with a skeleton while the image is in flight", () => {
    render(<VoucherViewer src={SRC} />);

    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });

  // The success path is not asserted here: next/image swallows a synthetic
  // load event on an image jsdom reports as zero-sized, so the test would be
  // exercising the framework rather than this component. That path is verified
  // in the browser. The error path below is this component's own logic.
  it("clears the skeleton on error, so it cannot pulse forever", () => {
    render(<VoucherViewer src={SRC} />);

    fireEvent.error(screen.getByAltText("Comprobante de pago"));
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders the comprobante through the image pipeline", () => {
    render(<VoucherViewer src={SRC} />);

    const proof = screen.getByAltText("Comprobante de pago");
    expect(proof.getAttribute("src")).toContain(encodeURIComponent(SRC));
  });
});
