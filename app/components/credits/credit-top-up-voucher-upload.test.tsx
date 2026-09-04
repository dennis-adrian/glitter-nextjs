// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
// The real one reaches UploadThing. All this test needs is a way to fire the
// completion callback the component wires up.
vi.mock("@/app/components/payments/payment-proof-upload", () => ({
  default: ({
    onUploadComplete,
  }: {
    onUploadComplete: (url: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onUploadComplete("https://x.test/v.png")}
    >
      finish-upload
    </button>
  ),
}));

import CreditTopUpVoucherUpload from "@/app/components/credits/credit-top-up-voucher-upload";
import {
  dismissFullTableBanner,
  isFullTableBannerDismissed,
} from "@/app/components/festivals/reservations/full-table-dismissal";

function renderUpload(
  props: { clearFullTableDismissalFor?: number; redirectTo?: string } = {},
) {
  return render(
    <CreditTopUpVoucherUpload
      topUpId={5}
      amount={20}
      uploadDeadlineAt={new Date(Date.now() + 9 * 60_000).toISOString()}
      {...props}
    />,
  );
}

describe("CreditTopUpVoucherUpload", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    push.mockClear();
    refresh.mockClear();
  });

  /**
   * The hole this closes: hide the banner, buy from the introduction screen,
   * have the post-purchase activation fail, and the map offers no way to
   * activate what was just paid for.
   */
  it("forgets a dismissed banner once the purchase is paid", () => {
    dismissFullTableBanner(3);
    renderUpload({ clearFullTableDismissalFor: 3 });

    fireEvent.click(screen.getByText("finish-upload"));

    expect(isFullTableBannerDismissed(3)).toBe(false);
  });

  it("leaves other dismissals alone", () => {
    dismissFullTableBanner(3);
    dismissFullTableBanner(4);
    renderUpload({ clearFullTableDismissalFor: 3 });

    fireEvent.click(screen.getByText("finish-upload"));

    expect(isFullTableBannerDismissed(4)).toBe(true);
  });

  /**
   * An invoice or debt top-up says nothing about the full table, so it must not
   * resurrect a banner the participant deliberately hid.
   */
  it("keeps the dismissal for a purchase that does not fund a full table", () => {
    dismissFullTableBanner(3);
    renderUpload();

    fireEvent.click(screen.getByText("finish-upload"));

    expect(isFullTableBannerDismissed(3)).toBe(true);
  });

  /**
   * Credits are bought from the thing that needs them, always mid-flow. After
   * paying, the participant belongs back there rather than in their wallet.
   */
  it("returns to where the purchase started", () => {
    renderUpload({ redirectTo: "/profiles/42/festivals/619/reservations/new" });

    fireEvent.click(screen.getByText("finish-upload"));

    expect(push).toHaveBeenCalledWith(
      "/profiles/42/festivals/619/reservations/new",
    );
  });

  it("just refreshes when the purchase has nowhere to return to", () => {
    renderUpload();

    fireEvent.click(screen.getByText("finish-upload"));

    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
});
