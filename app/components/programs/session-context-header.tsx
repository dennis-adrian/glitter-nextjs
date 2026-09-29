import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { programPath, publicFestivalPath } from "@/app/lib/programs/paths";

type Props = {
  /** Null for a standalone session. */
  program: { slug: string; name: string } | null;
  /** A standalone session's own festival; ignored for a program session. */
  festival: { id: number; name: string; status: string } | null;
};

const BACK_LINK_CLASS =
  "inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary";

/**
 * The strip above a session's hero, naming where the session belongs.
 *
 * A program session points back to its program and names it in a plain pill,
 * not a second link: the back link already goes there. A standalone session
 * has no program: it points back to the catalogue and, when it is part of a
 * festival, links to it, since that is the only context a visitor gets for it.
 * Program sessions leave the festival to their program page, which does not
 * show one either.
 */
export default function SessionContextHeader({ program, festival }: Props) {
  // A draft festival has no page and has not been announced: say nothing.
  const festivalHref = festival ? publicFestivalPath(festival) : null;

  return (
    // A program or festival name can be long; let the pill drop under the back
    // link rather than squeeze it.
    <div className="container relative mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-6 sm:px-8 lg:px-12">
      {program ? (
        <>
          <Link href={programPath(program.slug)} className={BACK_LINK_CLASS}>
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Volver a {program.name}
          </Link>
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
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-brand-ink/15 bg-brand-card px-4 text-sm font-semibold transition-colors hover:border-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
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
