import Link from "next/link";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import Heading from "@/app/components/atoms/heading";
import { cn } from "@/app/lib/utils";

/** A titled block of the hub, with an optional link beside the title. */
export function HubSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-wide text-brand-ink md:text-xl">
          {title}
        </h2>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-primary hover:underline"
          >
            {action.label}
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A plain rounded panel, the hub's card surface. */
export function HubPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-border bg-brand-card p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A screen opened from one of the hub's shortcuts on a phone: a way back to
 * the hub, the festival it belongs to, and the section on its own.
 */
export function HubSubpage({
  title,
  festivalName,
  children,
}: {
  title: string;
  festivalName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/my_participations"
          aria-label="Volver a Participaciones"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-card text-brand-ink hover:text-brand-primary"
        >
          <ChevronLeftIcon className="size-5" aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-col">
          <Heading className="text-2xl leading-none md:text-3xl lg:text-3xl">
            {title}
          </Heading>
          <span className="truncate text-sm text-brand-neutral">
            {festivalName}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
