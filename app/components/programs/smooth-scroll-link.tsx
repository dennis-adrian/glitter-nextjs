"use client";

import type {
  ComponentPropsWithoutRef,
  MouseEvent as ReactMouseEvent,
} from "react";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  targetId: string;
};

export default function SmoothScrollLink({
  children,
  onClick,
  targetId,
  ...props
}: Props) {
  function scrollToTarget(event: ReactMouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    const link = event.currentTarget;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download")
    ) {
      return;
    }

    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });

    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }

  return (
    <a href={`#${targetId}`} onClick={scrollToTarget} {...props}>
      {children}
    </a>
  );
}
