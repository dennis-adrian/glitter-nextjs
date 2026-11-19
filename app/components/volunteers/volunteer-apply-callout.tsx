import Link from "next/link";

import { CalendarXIcon } from "lucide-react";

import { buttonVariants } from "@/app/components/ui/button";
import { SOCIAL_LINKS } from "@/app/lib/site-contact";
import {
  VOLUNTEER_APPLY_PATH,
  VOLUNTEER_COPY,
  VOLUNTEER_STEPS,
} from "@/app/lib/volunteers/definitions";

const INSTAGRAM_URL =
  SOCIAL_LINKS.find((link) => link.network === "instagram")?.href ??
  "https://www.instagram.com/glitter.bo";

/**
 * The last section of /voluntarios: the four steps and the way in while the
 * call is open, "Convocatoria cerrada" after it closes.
 */
export default function VolunteerApplyCallout({
  open,
  festivalName,
  closesLabel,
}: {
  open: boolean;
  festivalName: string;
  /** "lunes 30 de noviembre a las 23:59". */
  closesLabel: string;
}) {
  return (
    <section id="postular" className="bg-brand-lavender">
      <div className="mx-auto max-w-3xl px-5 py-14 md:px-10 md:py-20">
        <h2 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] text-brand-ink md:text-[44px]">
          {VOLUNTEER_COPY.applyTitle}
        </h2>
        {open ? (
          <>
            <p className="mt-4 break-words text-brand-neutral">
              Recibimos postulaciones hasta el {closesLabel}.
            </p>
            <div className="mt-8 flex flex-col gap-5 rounded-[20px] border border-brand-border bg-brand-card p-5 md:p-10">
              <ol className="grid gap-3 sm:grid-cols-2">
                {VOLUNTEER_STEPS.map((step, index) => (
                  <li
                    key={step.section}
                    className="flex items-center gap-3 text-brand-neutral-strong"
                  >
                    <span className="flex size-8 flex-none items-center justify-center rounded-full bg-brand-deep font-display text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 break-words font-semibold">
                      {step.navLabel}
                    </span>
                  </li>
                ))}
              </ol>
              <Link
                href={VOLUNTEER_APPLY_PATH}
                className={buttonVariants({
                  variant: "cta",
                  size: "lg",
                  className: "w-full sm:w-auto sm:self-start",
                })}
              >
                {VOLUNTEER_COPY.applyNow}
              </Link>
              <p className="text-sm leading-5 break-words text-brand-neutral">
                {VOLUNTEER_COPY.applyFootnote}
              </p>
            </div>
          </>
        ) : (
          <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-brand-border bg-brand-card px-5 py-8 md:p-10">
            <div className="flex size-14 items-center justify-center rounded-full bg-brand-lavender text-brand-primary">
              <CalendarXIcon className="size-6" aria-hidden />
            </div>
            <h3 className="font-display text-[26px] leading-8 font-extrabold tracking-[-0.5px] text-brand-ink">
              {VOLUNTEER_COPY.closedTitle}
            </h3>
            <p className="break-words text-brand-neutral-strong">
              Las postulaciones para el voluntariado de {festivalName} cerraron
              el {closesLabel}.
            </p>
            <p className="text-sm leading-5 break-words text-brand-neutral">
              {VOLUNTEER_COPY.closedFollowUp}
            </p>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full sm:w-auto sm:self-start",
              })}
            >
              {VOLUNTEER_COPY.closedFollow}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
