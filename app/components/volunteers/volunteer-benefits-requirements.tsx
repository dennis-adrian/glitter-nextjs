import { CalendarIcon, CheckIcon } from "lucide-react";

import {
  VOLUNTEER_BENEFITS,
  VOLUNTEER_COPY,
  VOLUNTEER_MIN_AGE,
} from "@/app/lib/volunteers/definitions";

/** "Qué recibís" and "Requisitos", side by side from tablet up. */
export default function VolunteerBenefitsRequirements({
  ageCutoff,
  induction,
}: {
  /** "18 de diciembre de 2026"; null without shifts. */
  ageCutoff: string | null;
  /** "sábado 5 de diciembre", or null while it is not set. */
  induction: string | null;
}) {
  const requirements = [
    ageCutoff
      ? `Ser mayor de ${VOLUNTEER_MIN_AGE} años al ${ageCutoff}.`
      : `Ser mayor de ${VOLUNTEER_MIN_AGE} años.`,
    VOLUNTEER_COPY.requirementShifts,
    VOLUNTEER_COPY.requirementInduction,
  ];

  return (
    <section id="que-recibis" className="bg-brand-coral-soft">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-14 md:grid-cols-2 md:px-10 md:py-20 lg:px-20">
        <div className="min-w-0 rounded-[20px] border border-brand-ink/10 bg-brand-card p-6 md:p-8">
          <h2 className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink">
            {VOLUNTEER_COPY.benefitsTitle}
          </h2>
          <ul className="mt-6 grid gap-4">
            {VOLUNTEER_BENEFITS.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-3 text-brand-neutral-strong"
              >
                <CheckIcon
                  className="mt-0.5 size-5 flex-none text-brand-primary"
                  aria-hidden
                />
                <span className="min-w-0 break-words">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 rounded-[20px] border border-brand-ink/10 bg-brand-card p-6 md:p-8">
          <h2 className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink">
            {VOLUNTEER_COPY.requirementsTitle}
          </h2>
          <ol className="mt-6 grid gap-4">
            {requirements.map((requirement, index) => (
              <li
                key={requirement}
                className="flex items-start gap-3 text-brand-neutral-strong"
              >
                <span className="flex size-7 flex-none items-center justify-center rounded-full bg-brand-lavender font-display text-sm font-bold text-brand-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 pt-0.5 break-words">
                  {requirement}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-start gap-3 rounded-xl bg-brand-lavender px-4 py-3 text-sm leading-5 text-brand-neutral-strong">
            <CalendarIcon
              className="mt-0.5 size-4 flex-none text-brand-primary"
              aria-hidden
            />
            <span className="min-w-0 break-words">
              {VOLUNTEER_COPY.inductionLabel}{" "}
              <strong>
                {induction ?? VOLUNTEER_COPY.inductionToBeConfirmed}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
