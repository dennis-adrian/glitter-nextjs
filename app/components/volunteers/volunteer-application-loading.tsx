import { Skeleton } from "@/app/components/ui/skeleton";
import { VOLUNTEER_STEPS } from "@/app/lib/volunteers/definitions";

/**
 * What /voluntarios/postular shows the instant it is opened, while the
 * server reads the call: the form's own chrome (phone top bar and progress,
 * desktop step list and card) with the first step's title and placeholder
 * fields, so the page never sits blank after "Postular ahora".
 */
export default function VolunteerApplicationLoading() {
  const first = VOLUNTEER_STEPS[0];
  return (
    <div
      className="flex min-h-dvh flex-col bg-brand-elevated text-brand-ink"
      aria-busy="true"
    >
      <span className="sr-only">Cargando el formulario…</span>

      <div className="flex flex-col gap-2 border-b border-brand-border px-3 pt-2 pb-3 md:hidden">
        <div className="flex h-11 items-center justify-center">
          <span className="text-sm leading-5 font-semibold text-brand-neutral-strong">
            Paso 1 de {VOLUNTEER_STEPS.length}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 px-2">
          {VOLUNTEER_STEPS.map((step, index) => (
            <span
              key={step.section}
              className={
                index === 0
                  ? "h-1.5 rounded-full bg-brand-primary"
                  : "h-1.5 rounded-full bg-brand-lavender"
              }
            />
          ))}
        </div>
      </div>

      <div className="hidden h-[73px] border-b border-brand-border md:block" />

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col md:flex-row md:items-start md:gap-12 md:px-10 md:pt-12 md:pb-16">
        <div className="hidden md:block md:w-[260px] md:flex-none">
          <div className="mb-5 font-display text-2xl leading-8 font-extrabold tracking-[-0.5px] text-brand-ink">
            Postulá como voluntario/a
          </div>
          <div className="flex flex-col gap-1">
            {VOLUNTEER_STEPS.map((step) => (
              <Skeleton key={step.section} className="h-12 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-6 md:max-w-[640px] md:gap-8 md:rounded-[20px] md:border md:border-brand-border md:bg-brand-card md:p-10">
          <div>
            <div className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink">
              {first.title}
            </div>
            <p className="mt-2 text-brand-neutral">{first.lead}</p>
          </div>
          {[0, 1, 2, 3].map((field) => (
            <div key={field} className="grid gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
