import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnnouncementStrip from "@/app/components/navbar/announcement-strip";

const mocks = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const announcement = {
  display: "stacked" as const,
  rotationIntervalSeconds: 6,
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      text: "Quiero participar",
      href: "#participa",
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--announcement-strip-height");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AnnouncementStrip", () => {
  it("smooth-scrolls section links on the landing page", () => {
    mocks.pathname = "/";
    render(<AnnouncementStrip announcement={announcement} />);

    expect(
      screen.getByRole("link", { name: /Quiero participar/ }).getAttribute("href"),
    ).toBe("#participa");
  });

  it("sends section links to the landing page from other routes", () => {
    mocks.pathname = "/merch";
    render(<AnnouncementStrip announcement={announcement} />);

    expect(
      screen.getByRole("link", { name: /Quiero participar/ }).getAttribute("href"),
    ).toBe("/#participa");
  });

  it("exposes the strip height for landing hash-target offsets", async () => {
    mocks.pathname = "/";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 48,
      width: 0,
      height: 48,
      toJSON: () => ({}),
    });

    render(<AnnouncementStrip announcement={announcement} />);

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(
          "--announcement-strip-height",
        ),
      ).toBe("48px");
    });
  });

  it("does not change landing offsets in draft preview", async () => {
    mocks.pathname = "/";
    render(<AnnouncementStrip announcement={announcement} preview />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Anuncios" })).toBeTruthy();
    });
    expect(
      document.documentElement.style.getPropertyValue(
        "--announcement-strip-height",
      ),
    ).toBe("");
  });
});
