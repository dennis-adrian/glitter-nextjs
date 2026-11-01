import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import ListMemberCell from "@/app/components/communications/admin/list-member-cell";
import ListMembersPagination from "@/app/components/communications/admin/list-members-pagination";
import { Badge } from "@/app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import {
  audienceCountLine,
  CONFIRMADOS_LIST_EXPLANATION,
} from "@/app/lib/distribution_lists/definitions";
import {
  fetchConfirmadosFestival,
  fetchConfirmadosMembers,
} from "@/app/lib/distribution_lists/queries";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";

const festivalIdSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);
const pageSchema = z.coerce.number().int().positive().catch(1);

/** "Confirmados · <festival>", read-only: computed each time it is used. */
export default async function ConfirmadosListPage(props: {
  params: Promise<{ festivalId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireCommunicationsAdmin();
  const parsed = festivalIdSchema.safeParse((await props.params).festivalId);
  if (!parsed.success) notFound();
  const page = pageSchema.parse((await props.searchParams).page);

  const [festival, members] = await Promise.all([
    fetchConfirmadosFestival(parsed.data),
    fetchConfirmadosMembers(parsed.data, page),
  ]);
  if (!festival) notFound();
  const basePath = `/dashboard/communications/lists/festival/${festival.festivalId}`;

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <Link
        href="/dashboard/communications/lists"
        className="text-sm text-muted-foreground hover:underline"
      >
        Volver a las listas
      </Link>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{festival.listName}</h2>
          <FestivalStatusBadge
            status={festival.festivalStatus as FestivalBase["status"]}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {CONFIRMADOS_LIST_EXPLANATION}
        </p>
        <p className="text-sm font-medium tabular-nums">
          {audienceCountLine(festival.count)}
        </p>
      </div>

      {members.total === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nadie tiene una reserva confirmada en este festival.
        </p>
      ) : (
        <>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>En la reserva</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.rows.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell className="min-w-64">
                      <ListMemberCell member={member} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.isOwner && (
                          <Badge variant="secondary">Titular</Badge>
                        )}
                        {member.isPartner && (
                          <Badge variant="outline">Acompañante</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListMembersPagination
            page={members.page}
            pageCount={members.pageCount}
            basePath={basePath}
          />
        </>
      )}
    </div>
  );
}
