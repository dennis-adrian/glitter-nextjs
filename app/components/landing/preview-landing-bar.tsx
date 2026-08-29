"use client";

import { useEffect, useRef } from "react";

import AnnouncementStrip from "@/app/components/navbar/announcement-strip";
import type { LandingPageContentV1 } from "@/app/lib/landing_content/definitions";

export default function PreviewLandingBar({
  announcement,
}: {
  announcement: LandingPageContentV1["announcement"];
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const root = document.documentElement;
    const navbar = document.querySelector<HTMLElement>("[data-site-navbar]");
    const main = document.querySelector<HTMLElement>("main");
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".scroll-mt-20"),
    );
    const initialNavbarTop = navbar?.style.top;
    const initialMainPaddingTop = main?.style.paddingTop;
    const initialScrollMargins = sections.map(
      (section) => [section, section.style.scrollMarginTop] as const,
    );
    const updateHeight = () => {
      const height = `${bar.getBoundingClientRect().height}px`;
      root.style.setProperty("--landing-preview-bar-height", height);
      if (navbar) navbar.style.top = height;
      if (main) main.style.paddingTop = height;
      for (const section of sections) {
        section.style.scrollMarginTop = `calc(5rem + ${height})`;
      }
    };
    const observer = new ResizeObserver(updateHeight);

    root.dataset.landingPreview = "true";
    observer.observe(bar);
    updateHeight();

    return () => {
      observer.disconnect();
      delete root.dataset.landingPreview;
      root.style.removeProperty("--landing-preview-bar-height");
      if (navbar) navbar.style.top = initialNavbarTop ?? "";
      if (main) main.style.paddingTop = initialMainPaddingTop ?? "";
      for (const [section, scrollMarginTop] of initialScrollMargins) {
        section.style.scrollMarginTop = scrollMarginTop;
      }
    };
  }, []);

  return (
    <div ref={barRef} className="fixed inset-x-0 top-0 z-[60]">
      <div className="bg-brand-ink px-4 py-2 text-center text-sm font-semibold text-white">
        Vista previa del borrador
      </div>
      <AnnouncementStrip announcement={announcement} preview />
    </div>
  );
}
