import {
  CalendarIcon,
  LandPlotIcon,
  PackageOpenIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import ParticipantTransferDialog from "@/app/components/participations/admin/participant-transfer-dialog";
import { Badge } from "@/app/components/ui/badge";
import { buttonVariants } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDisplayDate } from "@/app/lib/formatters";
import type { AdminParticipationRow } from "@/app/lib/participations/admin-history";

function festivalDates(row: AdminParticipationRow): string | null {
  const { startDate, endDate } = row.festival;
  if (!startDate) return null;
  const full = { day: "numeric", month: "short", year: "numeric" } as const;
  const start = formatDisplayDate(startDate, full);
  if (!endDate) return start;
  const end = formatDisplayDate(endDate, full);
  return start === end ? start : `${start} – ${end}`;
}

/**
 * Every reservation an account has been on, for admins: the festival, the
 * stand, its status and who else was on it, with a way into the reservation.
 * Data-free so the admin user page and Storybook render the same markup.
 *
 * `canTransfer` adds the transfer, for a participant who lost access to this
 * account and kept participating from another one. Global admins only; the
 * command checks again.
 */
export default function ParticipationHistoryList({
  rows,
  userId,
  userName,
  canTransfer,
}: {
  rows: AdminParticipationRow[];
  userId: number;
  userName: string;
  canTransfer: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Historial de participaciones</CardTitle>
        <CardDescription>
          {rows.length === 0
            ? "Esta cuenta todavía no participó de ningún festival."
            : `${rows.length} ${rows.length === 1 ? "reserva" : "reservas"}, de la más reciente a la más antigua. Incluye las canceladas y rechazadas.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
            <PackageOpenIcon className="h-10 w-10" />
            <span className="text-sm">Sin participaciones</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const dates = festivalDates(row);
              return (
                <li
                  key={row.participationId}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="break-words font-medium leading-tight">
                      {row.festival.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReservationStatusBadge
                        status={row.status}
                        className="text-xs"
                      />
                      <Badge variant="outline" className="text-xs font-normal">
                        {row.isHolder ? "Titular" : "Compañero/a"}
                      </Badge>
                      {row.source === "admin_assignment" ? (
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          Asignada por admin
                        </Badge>
                      ) : null}
                    </div>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <LandPlotIcon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        {row.standCount > 1 ? "Espacios" : "Espacio"}{" "}
                        {row.standLabel}
                      </span>
                    </p>
                    {dates ? (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{dates}</span>
                      </p>
                    ) : null}
                    {row.companions.length > 0 ? (
                      <p className="flex items-start gap-1 text-sm text-muted-foreground">
                        <UsersIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">
                          Con{" "}
                          {row.companions.map((companion, index) => (
                            <span key={companion.id}>
                              {index > 0 ? ", " : null}
                              <Link
                                href={`/dashboard/users/${companion.id}`}
                                className="text-foreground underline-offset-4 hover:underline"
                              >
                                {companion.name}
                              </Link>
                            </span>
                          ))}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/dashboard/reservations/${row.reservationId}/edit`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      Ver reserva
                    </Link>
                    {canTransfer ? (
                      <ParticipantTransferDialog
                        reservationId={row.reservationId}
                        fromUserId={userId}
                        fromUserName={userName}
                        festivalName={row.festival.name}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
