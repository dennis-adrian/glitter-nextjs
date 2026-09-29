import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import ProgramArtworkFrame from "@/app/components/programs/program-artwork-frame";
import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import { buttonVariants } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import type { Program } from "@/app/lib/programs/definitions";
import { programPath } from "@/app/lib/programs/paths";
import { cn } from "@/app/lib/utils";

type Props = {
  program: Program;
  /** Listed sessions of this program that are still ahead. */
  upcomingCount: number;
};

/**
 * A program that still has something ahead, in the band above the sessions.
 * The whole card is one link, through the title's stretched hit area.
 */
export default function CatalogueProgramCard({
  program,
  upcomingCount,
}: Props) {
  return (
    <Card className="group relative isolate grid overflow-hidden rounded-[28px] border border-brand-ink/10 bg-brand-card text-brand-ink shadow-[0_24px_70px_rgba(41,0,92,0.12)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-brand-primary sm:grid-cols-[minmax(0,1.15fr)_2px_minmax(0,0.85fr)]">
      {/* Not positioned, so the title link's hit area spans the whole card. */}
      <div className="flex flex-col justify-center px-6 py-8 sm:px-8 sm:py-10 lg:px-12">
        <p className="w-fit rounded-full bg-brand-lavender px-3 py-1 text-xs font-semibold">
          Programa
        </p>
        <h2 className="mt-3 max-w-[18ch] text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.5px] sm:text-3xl lg:text-4xl">
          <Link
            href={programPath(program.slug)}
            className="decoration-brand-primary decoration-2 underline-offset-4 after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-none group-hover:underline"
          >
            {program.name}
          </Link>
        </h2>

        {program.summary ? (
          <p className="mt-2 line-clamp-3 max-w-lg leading-7 text-brand-ink/75 sm:text-lg sm:leading-8">
            {program.summary}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {/* Either date may be set alone; show whichever exists. */}
          {program.startDate || program.endDate ? (
            <ProgramDateStamp
              size="sm"
              start={program.startDate ?? program.endDate}
              end={program.endDate}
              third="year"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(buttonVariants({ variant: "cta" }), "min-h-11 gap-2")}
          >
            Ver programa
            <ArrowUpRightIcon className="size-4" />
          </span>
          <span className="text-sm font-medium tabular-nums text-brand-ink/75">
            {/* Announced before any session is published or scheduled. */}
            {upcomingCount === 0
              ? "Fechas por anunciar"
              : `${upcomingCount} ${upcomingCount === 1 ? "sesión próxima" : "sesiones próximas"}`}
          </span>
        </div>
      </div>

      {/* The talón: the ticket perforation between the stub and the art. */}
      <div
        aria-hidden="true"
        className="-order-1 border-t-2 border-dashed border-brand-primary/25 sm:order-none sm:border-l-2 sm:border-t-0"
      />

      <div className="relative order-first flex items-center bg-brand-lavender p-4 sm:order-last sm:p-6">
        <ProgramArtworkFrame
          src={
            isAllowedProgramArtworkUrl(program.bannerUrl)
              ? program.bannerUrl
              : null
          }
          sizes="(min-width: 1152px) 500px, (min-width: 640px) 45vw, 100vw"
          className="aspect-4/3 w-full"
          imageClassName="transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]"
        />
      </div>
    </Card>
  );
}
