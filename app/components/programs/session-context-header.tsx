import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import GlitterWeekLockup from "@/app/components/programs/glitter-week-lockup";
import { programPath, publicFestivalPath } from "@/app/lib/programs/paths";
import { cn } from "@/app/lib/utils";

type Props = {
  /** Null for a standalone session. */
  program: { slug: string; name: string } | null;
  /** A standalone session's own festival; ignored for a program session. */
  festival: { id: number; name: string; status: string } | null;
};

const BACK_LINK_CLASS =
  "inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] decoration-[#ffbe57] decoration-2 underline-offset-4 hover:underline";

/**
 * The strip above a session's hero, naming where the session belongs.
 *
 * A program session points back to its program and carries the program's
 * mark, as the program page does. A standalone session has no program: it
 * points back to the catalogue and, when it is part of a festival, links to
 * it, since that is the only context a visitor gets for it. Program sessions
 * leave the festival to their program page, which does not show one either.
 */
export default function SessionContextHeader({ program, festival }: Props) {
  // A draft festival has no page and has not been announced: say nothing.
  const festivalHref = festival ? publicFestivalPath(festival) : null;

  return (
    <div
      className={cn(
        "container relative mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-6 sm:px-8 lg:px-12",
        // A festival name can be long; let the pill drop under the back link
        // rather than squeeze it.
        !program && "flex-wrap gap-y-4",
      )}
    >
      {program ? (
        <>
          <Link href={programPath(program.slug)} className={BACK_LINK_CLASS}>
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Volver al programa
          </Link>
          <GlitterWeekLockup compact title={program.name} />
        </>
      ) : (
        <>
          <Link href="/programs" className={BACK_LINK_CLASS}>
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Charlas y Talleres
          </Link>
          {festival && festivalHref ? (
            <Link
              href={festivalHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/55 px-4 text-xs font-black uppercase tracking-widest transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
            >
              Parte de {festival.name}
              <ArrowUpRightIcon className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
