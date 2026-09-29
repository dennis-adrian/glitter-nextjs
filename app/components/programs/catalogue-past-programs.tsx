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
    <Card className="overflow-hidden rounded-[2rem] border-[#4b255f]/10 bg-white/70 text-[#4b255f] shadow-none">
      <ul className="divide-y divide-[#4b255f]/10">
        {programs.map((program) => {
          const dateRange = formatDateRange(program.startDate, program.endDate);

          return (
            <li key={program.id}>
              <Link
                href={programPath(program.slug)}
                className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#ffc1fd]/25 focus-visible:bg-[#ffc1fd]/25 focus-visible:outline-none sm:px-6"
              >
                <span className="min-w-0">
                  <span className="block font-black">{program.name}</span>
                  {dateRange ? (
                    <span className="mt-0.5 block text-sm font-medium text-[#70566f]">
                      {dateRange}
                    </span>
                  ) : null}
                </span>
                <ArrowUpRightIcon
                  className="size-4 shrink-0 text-[#9347f5] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
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
