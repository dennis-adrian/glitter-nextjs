import Link from "next/link";

import { CheckIcon, MailIcon } from "lucide-react";

import { buttonVariants } from "@/app/components/ui/button";
import { VOLUNTEER_COPY } from "@/app/lib/volunteers/definitions";

/**
 * After sending. It must not say the applicant is accepted or confirmed: a
 * duplicate email and a honeypot land here too.
 */
export default function VolunteerApplicationReceived({
  closesOn,
}: {
  /** "30 de noviembre". */
  closesOn: string;
}) {
  return (
    <div className="flex flex-1 justify-center bg-brand-lavender px-3 py-8 md:py-16">
      <div
        role="status"
        className="flex h-fit w-full max-w-lg flex-col items-center gap-4 rounded-[20px] border border-brand-border bg-brand-card px-5 py-8 text-center md:p-10"
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-success-500 text-green-900">
          <CheckIcon className="size-6" aria-hidden />
        </div>
        <h1
          tabIndex={-1}
          data-volunteer-focus
          className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink outline-none"
        >
          {VOLUNTEER_COPY.thankYouTitle}
        </h1>
        <p className="text-brand-neutral-strong">
          {VOLUNTEER_COPY.thankYouMessage}
        </p>
        <p className="text-sm leading-5 break-words text-brand-neutral">
          {VOLUNTEER_COPY.notGuaranteed} Revisamos todas las postulaciones
          cuando cierra la convocatoria, el {closesOn}.
        </p>
        <div className="flex w-full items-start gap-2.5 rounded-xl bg-surface-muted px-4 py-3 text-left text-sm leading-5 text-brand-neutral-strong">
          <MailIcon
            className="mt-0.5 size-4 flex-none text-brand-primary"
            aria-hidden
          />
          <span className="min-w-0 break-words">
            {VOLUNTEER_COPY.thankYouEmail}
          </span>
        </div>
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "w-full",
          })}
        >
          {VOLUNTEER_COPY.backHome}
        </Link>
      </div>
    </div>
  );
}
