import { ArrowDownIcon } from "lucide-react";

import ProgramArtworkFrame from "@/app/components/programs/program-artwork-frame";
import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import SmoothScrollLink from "@/app/components/programs/smooth-scroll-link";
import { buttonVariants } from "@/app/components/ui/button";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { cn } from "@/app/lib/utils";

type ProgramHeroProps = {
  name: string;
  summary: string | null;
  startDate: Date | null;
  endDate: Date | null;
  bannerUrl: string | null;
  sessionCount: number;
  dayCount: number;
  /** The id of the agenda section the primary action scrolls to. */
  agendaId: string;
};

/**
 * The program landing's opening band. A program's campaign look lives in its
 * banner, inside the artwork frame, never behind the page's text.
 */
export default function ProgramHero({
  name,
  summary,
  startDate,
  endDate,
  bannerUrl,
  sessionCount,
  dayCount,
  agendaId,
}: ProgramHeroProps) {
  return (
    <section className="grid border-b border-brand-ink/10 lg:min-h-150 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="relative flex flex-col justify-center bg-brand-lavender px-5 py-14 sm:px-10 sm:py-20 lg:px-[max(4rem,8vw)]">
        <div className="max-w-xl">
          <h1 className="max-w-[16ch] text-balance font-display text-5xl font-extrabold leading-[0.95] tracking-[-1.5px] sm:text-6xl lg:text-[60px]">
            {name}
          </h1>

          {summary ? (
            <p className="mt-5 max-w-lg text-balance text-lg leading-8 text-brand-ink/80 sm:text-xl">
              {summary}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {/* Either date may be set alone. With neither, the agenda's own
                days speak for the dates, so only an empty program says
                they are pending. */}
            {startDate || endDate || dayCount === 0 ? (
              <ProgramDateStamp
                start={startDate ?? endDate}
                end={endDate}
                third="year"
                size="lg"
              />
            ) : null}
            <SmoothScrollLink
              targetId={agendaId}
              className={cn(
                buttonVariants({ variant: "cta", size: "lg" }),
                "gap-2",
              )}
            >
              Explorar el programa
              <ArrowDownIcon className="size-4" aria-hidden="true" />
            </SmoothScrollLink>
            <span className="rounded-full bg-brand-card px-4 py-2 text-sm font-semibold tabular-nums">
              {sessionCount} {sessionCount === 1 ? "sesión" : "sesiones"} ·{" "}
              {dayCount} {dayCount === 1 ? "día" : "días"}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex items-center bg-brand-elevated p-5 sm:p-10 lg:p-14">
        <ProgramArtworkFrame
          src={isAllowedProgramArtworkUrl(bannerUrl) ? bannerUrl : null}
          sizes="(min-width: 1024px) 55vw, 100vw"
          priority
          shadow
          className="aspect-4/3 w-full lg:aspect-auto lg:h-full"
        />
      </div>
    </section>
  );
}
