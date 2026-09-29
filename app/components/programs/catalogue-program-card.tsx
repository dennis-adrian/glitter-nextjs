import { ArrowUpRightIcon, CalendarDaysIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";
import { resolveProgramArtwork } from "@/app/lib/programs/artwork";
import { formatDateRange } from "@/app/lib/programs/catalogue-view";
import type { Program } from "@/app/lib/programs/definitions";
import { programPath } from "@/app/lib/programs/paths";

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
  const dateRange = formatDateRange(program.startDate, program.endDate);

  return (
    <Card className="group relative isolate grid overflow-hidden rounded-[2.4rem] border-0 bg-[#9347f5] text-[#fffaf3] shadow-none ring-[#ffbe57] ring-offset-2 has-[a:focus-visible]:ring-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {/* Not positioned, so the title link's hit area spans the whole card. */}
      <div className="flex flex-col justify-center px-6 py-8 sm:px-8 sm:py-10 lg:px-12">
        <div
          aria-hidden="true"
          className="absolute -left-16 -top-20 -z-10 size-56 rounded-full bg-[#ffc1fd]/30"
        />

        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#dff8f4]">
          Programa
        </p>
        <h2 className="mt-3 font-display font-bold max-w-[16ch] text-balance text-4xl uppercase leading-[0.9] sm:text-5xl">
          <Link
            href={programPath(program.slug)}
            className="decoration-[#ffbe57] decoration-4 underline-offset-4 after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-none group-hover:underline"
          >
            {program.name}
          </Link>
        </h2>

        {dateRange ? (
          <p className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#dff8f4]">
            <CalendarDaysIcon className="size-4 shrink-0" aria-hidden="true" />
            {dateRange}
          </p>
        ) : null}
        {program.summary ? (
          <p className="mt-4 line-clamp-3 max-w-lg text-balance font-bold leading-snug sm:text-lg">
            {program.summary}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#ffbe57] px-5 text-sm font-black uppercase tracking-[0.08em] text-[#4b255f] transition group-hover:-translate-y-0.5 group-hover:bg-[#ffd477]"
          >
            Ver programa
            <ArrowUpRightIcon className="size-4" />
          </span>
          <Badge className="border-white/55 bg-transparent px-4 py-2 font-black uppercase tracking-widest text-[#fffaf3]">
            {/* Announced before any session is published or scheduled. */}
            {upcomingCount === 0
              ? "Fechas por anunciar"
              : `${upcomingCount} ${upcomingCount === 1 ? "sesión próxima" : "sesiones próximas"}`}
          </Badge>
        </div>
      </div>

      <div className="relative order-first min-h-52 overflow-hidden bg-[#72e5e7] sm:order-last sm:min-h-80">
        <Image
          src={resolveProgramArtwork(program.bannerUrl)}
          alt=""
          fill
          sizes="(min-width: 1152px) 500px, (min-width: 640px) 45vw, 100vw"
          className="object-cover object-top-right transition duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
    </Card>
  );
}
