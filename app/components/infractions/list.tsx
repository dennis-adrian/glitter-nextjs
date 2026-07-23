"use client";

import {
  InfractionSeverityBadge,
  InfractionStatusBadge,
} from "@/app/components/infractions/status-badge";
import UsersTablePagination from "@/app/components/users/users-table-pagination";
import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { formatDate } from "@/app/lib/formatters";
import { ALLOWED_INFRACTION_PAGE_SIZES } from "@/app/lib/infractions/constants";
import {
  getPriorNoticeLabel,
  participantDisplayName,
} from "@/app/lib/infractions/mappers";
import type { InfractionListItem } from "@/app/lib/infractions/queries";
import {
  sanctionStatusLabel,
  sanctionTypeLabel,
} from "@/app/lib/sanctions/mappers";
import { DateTime } from "luxon";
import Link from "next/link";
import { use } from "react";

function linkedSanction(infraction: InfractionListItem) {
  return infraction.sanctionLinks[0]?.sanction ?? null;
}

type InfractionsListProps = {
  fetchPromise: Promise<{ items: InfractionListItem[]; total: number }>;
  limit: number;
  offset: number;
};

export default function InfractionsList({
  fetchPromise,
  limit,
  offset,
}: InfractionsListProps) {
  const { items, total } = use(fetchPromise);
  const pageIndex = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden md:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participante</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Severidad</TableHead>
              <TableHead>Festival</TableHead>
              <TableHead>Aviso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Sanción</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  No se encontraron infracciones
                </TableCell>
              </TableRow>
            ) : (
              items.map((infraction) => {
                const sanction = linkedSanction(infraction);
                return (
                  <TableRow key={infraction.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {participantDisplayName(infraction.user)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {infraction.user.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col max-w-48">
                        <span>{infraction.type.label}</span>
                        {infraction.description && (
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {infraction.description}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <InfractionSeverityBadge
                        severity={infraction.type.severity}
                      />
                    </TableCell>
                    <TableCell>
                      {infraction.festival?.name ?? "Global"}
                    </TableCell>
                    <TableCell className="text-xs max-w-36">
                      {getPriorNoticeLabel({
                        userGaveNotice: infraction.userGaveNotice,
                        gaveNoticeAt: infraction.gaveNoticeAt,
                      })}
                    </TableCell>
                    <TableCell>
                      <InfractionStatusBadge status={infraction.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {sanction ? (
                        <Link
                          href={`/dashboard/sanctions/${sanction.id}`}
                          className="text-primary hover:underline"
                        >
                          {sanctionTypeLabel[sanction.type]} ·{" "}
                          {sanctionStatusLabel[sanction.status]}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(infraction.createdAt).toLocaleString(
                        DateTime.DATE_MED,
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/infractions/${infraction.id}`}>
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No se encontraron infracciones
          </p>
        ) : (
          items.map((infraction) => {
            const sanction = linkedSanction(infraction);
            return (
              <Link
                key={infraction.id}
                href={`/dashboard/infractions/${infraction.id}`}
                className="rounded-md border p-3 space-y-2 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">
                      {participantDisplayName(infraction.user)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {infraction.type.label}
                    </p>
                  </div>
                  <InfractionStatusBadge status={infraction.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <InfractionSeverityBadge
                    severity={infraction.type.severity}
                  />
                  <span className="text-xs text-muted-foreground self-center">
                    {infraction.festival?.name ?? "Global"}
                  </span>
                </div>
                {infraction.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {infraction.description}
                  </p>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Aviso:</dt>
                  <dd>
                    {getPriorNoticeLabel({
                      userGaveNotice: infraction.userGaveNotice,
                      gaveNoticeAt: infraction.gaveNoticeAt,
                    })}
                  </dd>
                  <dt className="text-muted-foreground">Sanción:</dt>
                  <dd>
                    {sanction
                      ? `${sanctionTypeLabel[sanction.type]} · ${sanctionStatusLabel[sanction.status]}`
                      : "—"}
                  </dd>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {formatDate(infraction.createdAt).toLocaleString(
                    DateTime.DATE_MED,
                  )}
                </p>
              </Link>
            );
          })
        )}
      </div>

      <UsersTablePagination
        canNextPage={pageIndex < pageCount}
        canPreviousPage={pageIndex > 1}
        pageIndex={pageIndex}
        pageCount={pageCount}
        pageSize={String(limit)}
        rowCount={items.length}
        total={total}
        pageSizes={ALLOWED_INFRACTION_PAGE_SIZES}
      />
    </div>
  );
}
