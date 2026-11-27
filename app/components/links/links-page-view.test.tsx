import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LinksPageView from "@/app/components/links/links-page-view";
import { resetLinksCountingForTests } from "@/app/components/links/visit-source";
import {
  DEFAULT_LINKS_HEADER,
  type PublicSiteLink,
} from "@/app/lib/links/definitions";

vi.mock("@/app/lib/posthog-capture", () => ({ captureClientEvent: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const links: PublicSiteLink[] = [
  {
    id: 7,
    kind: "link",
    label: "Preinscripción",
    href: "https://example.com/pre",
    icon: "link",
    iconSvg: null,
    imageUrl: null,
    layout: "classic",
  },
  {
    id: 8,
    kind: "social",
    label: "TikTok",
    href: "https://www.tiktok.com/@glitter.bo",
    icon: "tiktok",
    iconSvg: null,
    imageUrl: null,
    layout: "classic",
  },
];

const sendBeacon = vi.fn<(url: string) => boolean>();

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

function show(preview = false) {
  return render(
    <LinksPageView
      links={links}
      socialPosition="top"
      header={DEFAULT_LINKS_HEADER}
      preview={preview}
    />,
  );
}

beforeEach(() => {
  resetLinksCountingForTests();
  sendBeacon.mockReset().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", {
    value: sendBeacon,
    configurable: true,
  });
  setReferrer("");
});

afterEach(cleanup);

describe("counting /links", () => {
  it("counts one view per page load, with its source", () => {
    setReferrer("https://l.instagram.com/?u=x");
    const { rerender, unmount } = show();
    rerender(
      <LinksPageView
        links={links}
        socialPosition="bottom"
        header={DEFAULT_LINKS_HEADER}
      />,
    );
    unmount();
    show();
    expect(sendBeacon.mock.calls).toEqual([
      ["/api/links/view?source=instagram"],
    ]);
  });

  it("counts no view and no tap in the dashboard preview", () => {
    show(true);
    fireEvent.click(screen.getByText("Preinscripción"));
    fireEvent.click(screen.getByLabelText("TikTok"));
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("sends the visit's source with a tap", () => {
    show();
    fireEvent.click(screen.getByText("Preinscripción"));
    fireEvent.click(screen.getByLabelText("TikTok"));
    expect(sendBeacon.mock.calls).toEqual([
      ["/api/links/view?source=direct"],
      ["/api/links/7/click?source=direct"],
      ["/api/links/8/click?source=direct"],
    ]);
  });

  it("never lets a failed beacon reach the visitor", () => {
    sendBeacon.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => show()).not.toThrow();
    expect(() =>
      fireEvent.click(screen.getByText("Preinscripción")),
    ).not.toThrow();
  });

  it("waits for a prerendered page to be shown", () => {
    Object.defineProperty(document, "prerendering", {
      value: true,
      configurable: true,
    });
    try {
      show();
      expect(sendBeacon).not.toHaveBeenCalled();
      document.dispatchEvent(new Event("prerenderingchange"));
      expect(sendBeacon).toHaveBeenCalledWith("/api/links/view?source=direct");
    } finally {
      delete (document as { prerendering?: boolean }).prerendering;
    }
  });
});
