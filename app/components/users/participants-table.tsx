"use client";

import { ParticipantAggregates, ParticipantProfile } from "@/app/lib/participants/definitions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import ProfileCategoryBadge from "@/app/components/user_profile/category-badge";
import ActivityDateCell from "@/app/components/users/cells/activity-date-cell";
import { ParticipantActionsCell } from "@/app/components/users/cells/participant-actions";
import ProfileStatusCell from "@/app/components/users/cells/profile-status";
import UserInfoCell from "@/app/components/users/cells/user-info";
import { HeaderCell } from "@/app/components/users/header-cell";
import {
  participantEligibleStickyCellClass,
  participantEligibleSurfaceClass,
  PauseEligibilityNotice,
} from "@/app/components/users/participant-pause-eligibility";
import UsersTablePagination from "@/app/components/users/users-table-pagination";
import { cn } from "@/lib/utils";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { useSearchParams } from "next/navigation";
import { use } from "react";
import ParticipantsMobileList from "./participants-mobile-list";

type Props = {
  fetchParticipantsPromise: Promise<ParticipantProfile[]>;
  fetchParticipantAggregatesPromise: Promise<ParticipantAggregates>;
};

export default function ParticipantsTable({
  fetchParticipantsPromise,
  fetchParticipantAggregatesPromise,
}: Props) {
  const searchParams = useSearchParams();
  const limit = Number(searchParams.get("limit")) || 10;
  const offset = Number(searchParams.get("offset")) || 0;
  const participants = use(fetchParticipantsPromise);
  const aggregates = use(fetchParticipantAggregatesPromise);
  const canNextPage = offset + limit < aggregates.total;
  const canPreviousPage = offset > 0;
  const pageCount = Math.ceil(aggregates.total / limit);

  return (
    <div className="group-has-data-pending:animate-pulse">
      <div className="md:hidden flex min-w-0 flex-col gap-3">
        <ParticipantsMobileList participants={participants || []} />
      </div>

      <div className="hidden md:block">
        <Table className="border">
          <TableHeader>
            <TableRow>
              <HeaderCell canSort value="displayName" label="Perfil" />
              <HeaderCell canSort value="category" label="Categoría" />
              <HeaderCell canSort value="status" label="Estado" />
              <HeaderCell
                canSort
                value="lastParticipationAt"
                label="Última participación"
              />
              <HeaderCell
                canSort
                value="lastTermsAcceptedAt"
                label="Última aceptación de términos"
              />
              <HeaderCell
                canSort={false}
                value="acceptedParticipationsCount"
                label="Participaciones"
              />
              <HeaderCell
                canSort
                value="verifiedAt"
                label="Fecha de verificación"
              />
              <TableHead className="sticky right-0 z-20 bg-white shadow-inner">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants?.length ? (
              participants.map((participant) => {
                const isPauseEligible =
                  participant.activitySummary.isPauseEligible;

                return (
                  <TableRow
                    key={participant.id}
                    className={participantEligibleSurfaceClass(isPauseEligible)}
                  >
                    <TableCell>
                      <UserInfoCell profile={participant} />
                      {isPauseEligible ? (
                        <PauseEligibilityNotice className="mt-2 max-w-md" />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ProfileCategoryBadge profile={participant} />
                    </TableCell>
                    <TableCell>
                      <ProfileStatusCell status={participant.status} />
                    </TableCell>
                    <TableCell>
                      <ActivityDateCell
                        date={participant.activitySummary.lastParticipationAt}
                        festivalName={
                          participant.activitySummary
                            .lastParticipationFestivalName
                        }
                        emptyLabel="Nunca participó"
                        sourceLabel="Reserva aceptada"
                        exactDateStyle="date"
                      />
                    </TableCell>
                    <TableCell>
                      <ActivityDateCell
                        date={participant.activitySummary.lastTermsAcceptedAt}
                        festivalName={
                          participant.activitySummary
                            .lastTermsAcceptedFestivalName
                        }
                        emptyLabel="Nunca aceptó términos"
                        sourceLabel="Términos aceptados"
                      />
                    </TableCell>
                    <TableCell>
                      {participant.activitySummary.acceptedParticipationsCount}
                    </TableCell>
                    <TableCell>
                      {participant.verifiedAt
                        ? formatDate(participant.verifiedAt).toLocaleString(
                            DateTime.DATETIME_MED_WITH_SECONDS,
                          )
                        : "--"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "sticky right-0 z-20 shadow-inner",
                        participantEligibleStickyCellClass(isPauseEligible),
                      )}
                    >
                      <ParticipantActionsCell participant={participant} />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <UsersTablePagination
        canNextPage={canNextPage}
        canPreviousPage={canPreviousPage}
        pageIndex={Math.floor(offset / limit) + 1}
        pageCount={pageCount}
        pageSize={limit.toString()}
        rowCount={participants.length || 0}
        total={aggregates.total || 0}
      />
    </div>
  );
}
