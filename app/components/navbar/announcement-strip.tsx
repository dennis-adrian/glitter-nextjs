"use client";

import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { LandingPageContentV1 } from "@/app/lib/landing_content/definitions";
import SmoothScrollLink from "@/app/components/ui/smooth-scroll-link";

type Announcement = LandingPageContentV1["announcement"];
type AnnouncementItem = Announcement["items"][number];

function AnnouncementLine({
  item,
  isLandingPage,
}: {
  item: AnnouncementItem;
  isLandingPage: boolean;
}) {
  if (!item.href) return <p>{item.text}</p>;

  const isSectionLink = item.href.startsWith("#") && item.href.length > 1;
  const content = (
    <>
      <span>{item.text}</span>
      {isSectionLink ? (
        <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="sr-only">Abrir anuncio</span>
    </>
  );
  const className =
    "inline-flex items-center justify-center gap-1 rounded-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

  if (isSectionLink && isLandingPage) {
    return (
      <SmoothScrollLink className={className} targetId={item.href.slice(1)}>
        {content}
      </SmoothScrollLink>
    );
  }

  return (
    <Link
      href={isSectionLink ? `/${item.href}` : item.href}
      className={className}
    >
      {content}
    </Link>
  );
}

export default function AnnouncementStrip({
  announcement,
  preview = false,
}: {
  announcement: Announcement;
  /** The draft preview provides its already-resolved draft content directly. */
  preview?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDraftPreview = searchParams.get("preview") === "landing-draft";
  const stripRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const { display, items, rotationIntervalSeconds } = announcement;
  const isHidden =
    pathname.startsWith("/dashboard") ||
    (!preview && isDraftPreview) ||
    items.length === 0;

  useEffect(() => {
    if (display !== "rotating" || items.length < 2) return;

    const rotationMs = rotationIntervalSeconds * 1000;
    let exitTimer: number | undefined;
    let rotateTimer: number | undefined;
    const scheduleRotation = () => {
      exitTimer = window.setTimeout(
        () => {
          setIsLeaving(true);
          rotateTimer = window.setTimeout(() => {
            setActiveIndex((index) => (index + 1) % items.length);
            setIsLeaving(false);
            scheduleRotation();
          }, 180);
        },
        Math.max(rotationMs - 180, 0),
      );
    };
    scheduleRotation();

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(rotateTimer);
    };
  }, [display, items.length, rotationIntervalSeconds]);

  useEffect(() => {
    // Preview already adds this strip into `--landing-preview-bar-height`.
    if (isHidden || preview) return;

    const strip = stripRef.current;
    if (!strip) return;

    const root = document.documentElement;
    const updateHeight = () => {
      root.style.setProperty(
        "--announcement-strip-height",
        `${strip.getBoundingClientRect().height}px`,
      );
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(strip);
    updateHeight();

    return () => {
      observer.disconnect();
      root.style.removeProperty("--announcement-strip-height");
    };
  }, [isHidden, preview]);

  if (isHidden) return null;

  const visibleItems =
    display === "rotating" ? [items[activeIndex % items.length]] : items;

  return (
    <section
      ref={stripRef}
      aria-label="Anuncios"
      className="border-b border-white/15 bg-brand-ink px-5 py-2 text-center text-sm text-white sm:px-8"
    >
      <ul
        aria-live={display === "rotating" ? "polite" : undefined}
        className="mx-auto max-w-[1440px] divide-y divide-white/15 overflow-hidden"
      >
        {visibleItems.map((item) => (
          <li
            key={item.id}
            className={`py-1.5 first:pt-0 last:pb-0 ${
              display === "rotating"
                ? isLeaving
                  ? "motion-safe:animate-announcement-out"
                  : "motion-safe:animate-announcement-in"
                : ""
            }`}
          >
            <AnnouncementLine
              item={item}
              isLandingPage={pathname === "/"}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
