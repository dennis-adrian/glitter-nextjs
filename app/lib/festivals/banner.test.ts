import { describe, expect, it } from "vitest";

import {
  hasFestivalBanner,
  resolveFestivalBanner,
} from "@/app/lib/festivals/banner";

describe("resolveFestivalBanner", () => {
  it("art-directs when the festival has both banners", () => {
    expect(
      resolveFestivalBanner({
        festivalBannerUrl: "/wide.png",
        festivalBannerMobileUrl: "/phone.png",
      }),
    ).toEqual({ wideSrc: "/wide.png", mobileSrc: "/phone.png" });
  });

  it("shows the 3:1 banner everywhere without a phone banner, as before", () => {
    expect(
      resolveFestivalBanner({
        festivalBannerUrl: "/wide.png",
        festivalBannerMobileUrl: null,
      }),
    ).toEqual({ wideSrc: "/wide.png", mobileSrc: null });
  });

  it("shows the phone banner everywhere when it is the only one", () => {
    expect(
      resolveFestivalBanner({
        festivalBannerUrl: null,
        festivalBannerMobileUrl: "/phone.png",
      }),
    ).toEqual({ wideSrc: "/phone.png", mobileSrc: null });
  });

  it("treats empty strings as missing and the same file twice as one", () => {
    expect(
      resolveFestivalBanner({
        festivalBannerUrl: "",
        festivalBannerMobileUrl: "/phone.png",
      }),
    ).toEqual({ wideSrc: "/phone.png", mobileSrc: null });
    expect(
      resolveFestivalBanner({
        festivalBannerUrl: "/same.png",
        festivalBannerMobileUrl: "/same.png",
      }),
    ).toEqual({ wideSrc: "/same.png", mobileSrc: null });
  });

  it("is null when there is no banner at all", () => {
    const none = { festivalBannerUrl: null, festivalBannerMobileUrl: "" };
    expect(resolveFestivalBanner(none)).toBeNull();
    expect(hasFestivalBanner(none)).toBe(false);
  });
});
