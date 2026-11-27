import { Skeleton } from "@/app/components/ui/skeleton";
import {
  CULTURAL_ACTIVITY_COPY,
  CULTURAL_ACTIVITY_STEPS,
} from "@/app/lib/live_acts/definitions";

/**
 * What /actividades-culturales/postular shows the instant it is opened: the
 * form's own chrome with placeholder fields, so it never sits blank.
 */
export default function CulturalActivityWizardLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-brand-elevated text-brand-ink"
      aria-busy="true"
    >
      <span className="sr-only">Cargando el formulario…</span>

      <div className="flex flex-col gap-2 border-b border-brand-border px-3 pt-2 pb-3 md:hidden">
        <div className="h-11" />
        <div className="grid grid-cols-3 gap-1.5 px-2">
          {CULTURAL_ACTIVITY_STEPS.map((step) => (
            <span
              key={step.section}
              className="h-1.5 rounded-full bg-brand-lavender"
            />
          ))}
        </div>
      </div>

      <div className="hidden h-[73px] border-b border-brand-border md:block" />

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col md:flex-row md:items-start md:gap-12 md:px-10 md:pt-12 md:pb-16">
        <div className="hidden md:block md:w-[260px] md:flex-none">
          <div className="mb-5 font-display text-2xl leading-8 font-extrabold tracking-[-0.5px] text-brand-ink">
            {CULTURAL_ACTIVITY_COPY.applyTitle}
          </div>
          <div className="flex flex-col gap-1">
            {CULTURAL_ACTIVITY_STEPS.map((step) => (
              <Skeleton key={step.section} className="h-12 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-6 md:max-w-[640px] md:gap-8 md:rounded-[20px] md:border md:border-brand-border md:bg-brand-card md:p-10">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-full" />
          {[0, 1, 2, 3].map((field) => (
            <Skeleton key={field} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
