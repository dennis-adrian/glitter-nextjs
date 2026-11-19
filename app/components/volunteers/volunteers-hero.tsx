import Link from "next/link";

import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  WrenchIcon,
} from "lucide-react";

import { buttonVariants } from "@/app/components/ui/button";
import {
  VOLUNTEER_APPLY_PATH,
  VOLUNTEER_COPY,
} from "@/app/lib/volunteers/definitions";

type Props = {
  festivalName: string;
  /** "19–20" over "dic 2026"; null when the festival has no dates. */
  dateTile: { days: string; monthYear: string } | null;
  venue: string | null;
  /** "viernes 18 de diciembre"; null without shifts. */
  setupDay: string | null;
  /** "lunes 30 de noviembre, 23:59". */
  closesLabel: string;
  open: boolean;
};

/** The /voluntarios hero: pitch, call to action and the festival's facts. */
export default function VolunteersHero({
  festivalName,
  dateTile,
  venue,
  setupDay,
  closesLabel,
  open,
}: Props) {
  const facts = [
    setupDay ? { icon: WrenchIcon, text: `Montaje el ${setupDay}` } : null,
    { icon: ClockIcon, text: "Turnos de 4 horas, máximo 2 por día" },
    {
      icon: CalendarIcon,
      text: open
        ? `Postulaciones hasta el ${closesLabel}`
        : `Postulaciones cerradas el ${closesLabel}`,
    },
  ].filter((fact) => fact !== null);

  return (
    <section className="bg-brand-elevated">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:px-10 md:py-20 lg:px-20">
        <div className="min-w-0">
          <h1 className="font-display text-[44px] leading-[0.95] font-extrabold tracking-[-1.5px] break-words text-brand-ink md:text-6xl">
            {VOLUNTEER_COPY.heroTitleLead}{" "}
            <span className="text-brand-primary">
              {VOLUNTEER_COPY.heroTitleAccent}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-7 break-words text-brand-neutral">
            {VOLUNTEER_COPY.heroLead}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            {open ? (
              <Link
                href={VOLUNTEER_APPLY_PATH}
                // The form is a dynamic page: prefetch all of it, not just
                // its loading state, so the click renders without a wait.
                prefetch
                className={buttonVariants({ variant: "cta", size: "lg" })}
              >
                {VOLUNTEER_COPY.applyNow}
              </Link>
            ) : (
              <span className="inline-flex min-h-12 items-center rounded-full border border-brand-border bg-brand-card px-6 font-semibold text-brand-neutral-strong">
                {VOLUNTEER_COPY.closedTitle}
              </span>
            )}
            <a
              href="#turnos"
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-primary hover:underline"
            >
              {VOLUNTEER_COPY.seeShifts}
              <ArrowRightIcon className="size-4" aria-hidden />
            </a>
          </div>
        </div>

        <div className="min-w-0 rounded-[20px] border border-brand-border bg-brand-card p-6">
          <div className="flex items-center gap-4">
            {dateTile ? (
              <div className="flex-none rounded-[18px] bg-brand-deep px-5 py-3.5 text-center font-display text-white">
                <div className="text-2xl leading-8 font-extrabold">
                  {dateTile.days}
                </div>
                <div className="text-sm leading-5 font-semibold">
                  {dateTile.monthYear}
                </div>
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="font-display text-xl leading-7 font-bold break-words text-brand-ink">
                {festivalName}
              </div>
              {venue ? (
                <div className="text-sm leading-5 break-words text-brand-neutral">
                  {venue}
                </div>
              ) : null}
            </div>
          </div>
          <div className="my-5 border-t border-brand-border" />
          <ul className="grid gap-3">
            {facts.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-start gap-3 text-sm leading-5 text-brand-neutral-strong"
              >
                <Icon
                  className="mt-0.5 size-4 flex-none text-brand-primary"
                  aria-hidden
                />
                <span className="min-w-0 break-words">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
