import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  celebrated: vi.fn(async () => ({ success: true })),
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/app/lib/notifications/actions", () => ({
  markGiftsCelebratedAction: mocks.celebrated,
}));
vi.mock("@/app/components/notifications/push-control", () => ({
  PushOffer: () => null,
}));

import CreditGiftCelebrationBanner from "@/app/components/credit_gifts/credit-gift-celebration-banner";

function showBanner() {
  return render(
    <CreditGiftCelebrationBanner
      notificationIds={[41, 42]}
      totalCredits={25}
    />,
  );
}

function bannerShown() {
  return screen.queryByText(/Recibiste 25 créditos de regalo/) != null;
}

beforeEach(() => {
  mocks.pathname = "/";
  mocks.celebrated.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("the gift banner", () => {
  it("shows once where it appears, and counts as shown", () => {
    showBanner();
    expect(bannerShown()).toBe(true);
    expect(mocks.celebrated).toHaveBeenCalledWith([41, 42]);
  });

  it("stays behind when the person moves on, as the layout holding it does not", () => {
    const { rerender } = showBanner();
    mocks.pathname = "/festivals/3";
    rerender(
      <CreditGiftCelebrationBanner
        notificationIds={[41, 42]}
        totalCredits={25}
      />,
    );
    expect(bannerShown()).toBe(false);
  });

  it.each(["/my_credits", "/my_notifications/42"])(
    "stays out of %s, which already says it",
    (pathname) => {
      mocks.pathname = pathname;
      showBanner();
      expect(bannerShown()).toBe(false);
      expect(mocks.celebrated).toHaveBeenCalledWith([41, 42]);
    },
  );

  it("still shows on another notification's page", () => {
    mocks.pathname = "/my_notifications/7";
    showBanner();
    expect(bannerShown()).toBe(true);
  });
});
