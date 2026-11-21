import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { cn } from "@/app/lib/utils";
import {
  shiftCoverageState,
  volunteerShiftAdminPath,
  type ShiftCoverageState,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import {
  compareShiftsByStart,
  formatShiftWhen,
  formatShiftWhenShort,
} from "@/app/lib/volunteers/format";

/** The coverage badge's colour per state: the card's and the shift screen's. */
export const COVERAGE_BADGE_VARIANTS = {
  unset: "outline",
  complete: "green",
  missing: "amber",
  short: "red",
} as const satisfies Record<ShiftCoverageState["kind"], string>;

/** "7 de 10" */
export function assignedOf(
  shift: Pick<VolunteerShiftCoverage, "assignedCount" | "neededHeadcount">,
) {
  return `${shift.assignedCount} de ${shift.neededHeadcount}`;
}

/** The assigned share of the cupo as a bar; empty while there is no cupo. */
export function CoverageMeter({
  shift,
}: {
  shift: Pick<VolunteerShiftCoverage, "assignedCount" | "neededHeadcount">;
}) {
  const percent =
    shift.neededHeadcount > 0
      ? Math.round(
          Math.min(shift.assignedCount / shift.neededHeadcount, 1) * 100,
        )
      : 0;
  return (
    <Progress
      value={percent}
      aria-label={`${assignedOf(shift)} asignados`}
      className="bg-muted"
    />
  );
}

/** Active shifts in time order: the order the festival runs them. */
export function coverageShifts(shifts: readonly VolunteerShiftCoverage[]) {
  return shifts.filter((shift) => shift.isActive).sort(compareShiftsByStart);
}

/**
 * "Cobertura por turno": per active shift, who marked it, who is assigned
 * against the cupo, and whether it can still be filled. Each shift opens its
 * own screen. A table from md; on phones a tappable row per shift, with a
 * badge and a bar.
 */
export default function VolunteerCoverageCard({
  festivalId,
  shifts: allShifts,
  className,
}: {
  festivalId: number;
  shifts: VolunteerShiftCoverage[];
  className?: string;
}) {
  const shifts = coverageShifts(allShifts);
  return (
    <Card
      aria-labelledby="volunteer-coverage-title"
      role="region"
      className={className}
    >
      <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
        <h2
          id="volunteer-coverage-title"
          className="text-lg leading-tight font-semibold"
        >
          Cobertura por turno
        </h2>
        <CardDescription className="md:hidden">
          Tocá un turno para ver quién está asignado y quién puede cubrirlo.
        </CardDescription>
        <CardDescription className="max-md:hidden">
          Personas aceptadas y asignadas a cada turno, contra el cupo que
          necesitás. Abrí un turno para ver quién está asignado y quién puede
          cubrirlo.
        </CardDescription>
      </CardHeader>
      <CardContent
        className={cn(
          shifts.length === 0 ? "p-4 pt-2" : "p-0 pb-2",
          "md:p-6 md:pt-2",
        )}
      >
        {shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay turnos activos.
          </p>
        ) : (
          <>
            <ul className="flex flex-col md:hidden">
              {shifts.map((shift) => {
                const state = shiftCoverageState(shift);
                return (
                  <li key={shift.id} className="border-t">
                    <Link
                      href={volunteerShiftAdminPath(festivalId, shift.id)}
                      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 grow text-sm">
                          <p className="font-semibold">
                            {formatShiftWhenShort(shift)}
                          </p>
                          <p className="break-words text-muted-foreground">
                            {shift.label}
                          </p>
                        </div>
                        <Badge
                          variant={COVERAGE_BADGE_VARIANTS[state.kind]}
                          className="tabular-nums"
                          title={state.label}
                        >
                          {assignedOf(shift)}
                          <span className="sr-only">: {state.label}</span>
                        </Badge>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                      </div>
                      <CoverageMeter shift={shift} />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:-mx-6 md:-mb-6 md:block">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Turno</TableHead>
                    <TableHead scope="col" className="text-right">
                      Disponibles
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Asignados
                    </TableHead>
                    <TableHead scope="col" className="w-[28%]">
                      Cobertura
                    </TableHead>
                    <TableHead scope="col">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((shift) => {
                    const state = shiftCoverageState(shift);
                    return (
                      <TableRow key={shift.id}>
                        <TableCell className="min-w-52">
                          <Link
                            href={volunteerShiftAdminPath(festivalId, shift.id)}
                            className="font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:underline"
                          >
                            {formatShiftWhen(shift)}
                          </Link>
                          <p className="break-words text-muted-foreground">
                            {shift.label}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {shift.availableCount}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {assignedOf(shift)}
                        </TableCell>
                        <TableCell>
                          <CoverageMeter shift={shift} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={COVERAGE_BADGE_VARIANTS[state.kind]}
                            className="h-auto whitespace-normal"
                          >
                            {state.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
