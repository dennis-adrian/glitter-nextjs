import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { Card } from "@/app/components/ui/card";
import { formatDateRange } from "@/app/lib/programs/catalogue-view";
import type { Program } from "@/app/lib/programs/definitions";
import { programPath } from "@/app/lib/programs/paths";

type Props = {
  programs: Program[];
};

/**
 * Programs with nothing left ahead, as a compact list. Their pages still
 * work, and are where someone goes back to see what happened.
 */
export default function CataloguePastPrograms({ programs }: Props) {
  return (
    <Card className="overflow-hidden rounded-2xl border-brand-ink/10 bg-brand-card text-brand-ink shadow-none">
      <ul className="divide-y divide-brand-ink/10">
        {programs.map((program) => {
          const dateRange = formatDateRange(program.startDate, program.endDate);

          return (
            <li key={program.id}>
              <Link
                href={programPath(program.slug)}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-brand-lavender/40 focus-visible:bg-brand-lavender/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-primary sm:px-6"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{program.name}</span>
                  {dateRange ? (
                    <span className="mt-0.5 block text-sm tabular-nums text-brand-ink/75">
                      {dateRange}
                    </span>
                  ) : null}
                </span>
                <ArrowUpRightIcon
                  className="size-4 shrink-0 text-brand-primary"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
