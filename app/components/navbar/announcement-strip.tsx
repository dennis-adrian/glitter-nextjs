"use client";

import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { LandingPageContentV1 } from "@/app/lib/landing_content/definitions";

type Announcement = LandingPageContentV1["announcement"];
type AnnouncementItem = Announcement["items"][number];

function AnnouncementLine({ item }: { item: AnnouncementItem }) {
  if (!item.href) return <p>{item.text}</p>;

  return (
    <Link
      href={item.href}
      className="inline-flex items-center justify-center gap-1 rounded-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <span>{item.text}</span>
      {item.href.startsWith("#") ? (
        <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="sr-only">Abrir anuncio</span>
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const { display, items, rotationIntervalSeconds } = announcement;

  useEffect(() => {
    if (display !== "rotating" || items.length < 2) return;

    const rotationMs = rotationIntervalSeconds * 1000;
    let exitTimer: ReturnType<typeof window.setTimeout> | undefined;
    let rotateTimer: ReturnType<typeof window.setTimeout> | undefined;
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

  if (
    pathname.startsWith("/dashboard") ||
    (!preview && isDraftPreview) ||
    items.length === 0
  )
    return null;

  const visibleItems =
    display === "rotating" ? [items[activeIndex % items.length]] : items;

  return (
    <section
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
            <AnnouncementLine item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
