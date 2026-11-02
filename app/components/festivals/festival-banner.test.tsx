import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FestivalBanner, {
  FESTIVAL_BANNER_WIDE_MEDIA,
} from "@/app/components/festivals/festival-banner";

afterEach(cleanup);

const sizes = "(min-width: 1024px) 720px, 100vw";

describe("FestivalBanner", () => {
  it("serves the phone banner below md and the wide one from md up", () => {
    const { container } = render(
      <FestivalBanner
        festival={{
          festivalBannerUrl: "/wide.png",
          festivalBannerMobileUrl: "/phone.png",
        }}
        alt="Festicker"
        sizes={sizes}
        highPriority
      />,
    );

    const picture = container.querySelector("picture");
    expect(picture).not.toBeNull();
    const sources = picture!.querySelectorAll("source");
    expect(sources).toHaveLength(1);
    expect(sources[0].getAttribute("media")).toBe(FESTIVAL_BANNER_WIDE_MEDIA);
    expect(sources[0].getAttribute("srcset")).toContain("wide.png");
    expect(sources[0].getAttribute("srcset")).not.toContain("phone.png");

    const img = picture!.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Festicker");
    expect(img.getAttribute("src")).toContain("phone.png");
    expect(img.getAttribute("srcset")).toContain("phone.png");
    expect(img.getAttribute("srcset")).not.toContain("wide.png");
    expect(img.getAttribute("width")).toBe("1200");
    expect(img.getAttribute("height")).toBe("800");
    // fetchPriority, not preload/eager, so only the matching image loads.
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toBe("h-auto w-full");
  });

  it("renders today's single image without a phone banner", () => {
    const { container } = render(
      <FestivalBanner
        festival={{
          festivalBannerUrl: "/wide.png",
          festivalBannerMobileUrl: null,
        }}
        alt="Festicker"
        sizes={sizes}
      />,
    );

    expect(container.querySelector("picture")).toBeNull();
    expect(container.querySelector("source")).toBeNull();
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toContain("wide.png");
    expect(imgs[0].getAttribute("width")).toBe("2000");
    expect(imgs[0].getAttribute("height")).toBe("667");
  });

  it("shows the phone banner on every width when it is the only one", () => {
    const { container } = render(
      <FestivalBanner
        festival={{
          festivalBannerUrl: null,
          festivalBannerMobileUrl: "/phone.png",
        }}
        alt="Festicker"
        sizes={sizes}
      />,
    );

    expect(container.querySelector("source")).toBeNull();
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toContain("phone.png");
  });

  it("renders nothing without a banner", () => {
    const { container } = render(
      <FestivalBanner
        festival={{ festivalBannerUrl: null, festivalBannerMobileUrl: null }}
        alt="Festicker"
        sizes={sizes}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
