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
import {
  shiftCoverageState,
  type ShiftCoverageState,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import {
  compareShiftsByStart,
  formatShiftWhen,
  formatShiftWhenShort,
} from "@/app/lib/volunteers/format";

const BADGE_VARIANTS = {
  unset: "outline",
  complete: "green",
  missing: "amber",
  short: "red",
} as const satisfies Record<ShiftCoverageState["kind"], string>;

function assignedOf(shift: VolunteerShiftCoverage) {
  return `${shift.assignedCount} de ${shift.neededHeadcount}`;
}

/** The assigned share of the cupo as a bar; empty while there is no cupo. */
export function CoverageMeter({ shift }: { shift: VolunteerShiftCoverage }) {
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
 * against the cupo, and whether it can still be filled. A table from md, a
 * list with a badge and a bar per shift on phones.
 */
export default function VolunteerCoverageCard({
  shifts: allShifts,
}: {
  shifts: VolunteerShiftCoverage[];
}) {
  const shifts = coverageShifts(allShifts);
  return (
    <Card aria-labelledby="volunteer-coverage-title" role="region">
      <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
        <h2
          id="volunteer-coverage-title"
          className="text-lg leading-tight font-semibold"
        >
          Cobertura por turno
        </h2>
        <CardDescription className="max-md:sr-only">
          Personas aceptadas y asignadas a cada turno, contra el cupo que
          necesitás.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2 md:p-6 md:pt-2">
        {shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay turnos activos.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3.5 md:hidden">
              {shifts.map((shift) => {
                const state = shiftCoverageState(shift);
                return (
                  <li key={shift.id} className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold">
                          {formatShiftWhenShort(shift)}
                        </p>
                        <p className="break-words text-muted-foreground">
                          {shift.label}
                        </p>
                      </div>
                      <Badge
                        variant={BADGE_VARIANTS[state.kind]}
                        className="tabular-nums"
                        title={state.label}
                      >
                        {assignedOf(shift)}
                        <span className="sr-only">: {state.label}</span>
                      </Badge>
                    </div>
                    <CoverageMeter shift={shift} />
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
                          <p className="font-semibold whitespace-nowrap">
                            {formatShiftWhen(shift)}
                          </p>
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
                            variant={BADGE_VARIANTS[state.kind]}
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
