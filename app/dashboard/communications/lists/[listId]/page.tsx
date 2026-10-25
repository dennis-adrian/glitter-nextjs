import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FixedListEditor } from "@/app/components/communications/admin/fixed-list-editor";
import ListArchiveButton from "@/app/components/communications/admin/list-archive-button";
import ListFilterEditor from "@/app/components/communications/admin/list-filter-editor";
import ListMembersPagination from "@/app/components/communications/admin/list-members-pagination";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import {
  audienceCountLine,
  DISTRIBUTION_LIST_KIND_LABELS,
  EMPTY_DISTRIBUTION_LIST_FILTER,
  unreadableListFilterMessage,
} from "@/app/lib/distribution_lists/definitions";
import {
  fetchDistributionList,
  fetchFixedListMembers,
  fetchListFilterOptions,
} from "@/app/lib/distribution_lists/queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";

export const metadata: Metadata = {
  title: "Lista · Comunicaciones",
};

const listIdSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);
const pageSchema = z.coerce.number().int().positive().catch(1);

/**
 * One saved list. Archived ones still open, read-only, so an old link or a
 * draft that names one can show what it was.
 */
export default async function DistributionListPage(props: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireCommunicationsAdmin();
  const parsed = listIdSchema.safeParse((await props.params).listId);
  if (!parsed.success) notFound();
  const page = pageSchema.parse((await props.searchParams).page);

  const list = await fetchDistributionList(parsed.data);
  if (!list) notFound();
  const archived = list.archivedAt !== null;
  const basePath = `/dashboard/communications/lists/${list.id}`;

  const [options, members] = await Promise.all([
    list.kind === "filter" ? fetchListFilterOptions() : null,
    list.kind === "fixed" ? fetchFixedListMembers(list.id, page) : null,
  ]);

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <Link
        href="/dashboard/communications/lists"
        className="text-sm text-muted-foreground hover:underline"
      >
        Volver a las listas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{list.name}</h2>
            <Badge variant={list.kind === "filter" ? "secondary" : "outline"}>
              {DISTRIBUTION_LIST_KIND_LABELS[list.kind]}
            </Badge>
            {archived && <Badge variant="dark">Archivada</Badge>}
          </div>
          {list.count && (
            <p className="text-sm font-medium tabular-nums">
              {audienceCountLine(list.count)}
            </p>
          )}
        </div>
        {!archived && (
          <ListArchiveButton list={{ id: list.id, name: list.name }} />
        )}
      </div>

      {archived && (
        <Banner variant="info" title="Esta lista está archivada">
          {`Se archivó el ${formatDateWithTime(list.archivedAt!)}. Ya no aparece al elegir destinatarios y no se puede cambiar.`}
        </Banner>
      )}
      {list.unreadableFilter && (
        <Banner variant="warning" title="Filtro ilegible">
          {`${unreadableListFilterMessage(list.name)} Elegí los filtros de nuevo y guardá: hasta entonces la lista no se puede usar.`}
        </Banner>
      )}

      {list.kind === "filter" && options ? (
        <ListFilterEditor
          listId={list.id}
          initialName={list.name}
          initialDescription={list.description ?? ""}
          initialFilter={list.filter ?? EMPTY_DISTRIBUTION_LIST_FILTER}
          options={options}
          readOnly={archived}
        />
      ) : members ? (
        <FixedListEditor
          listId={list.id}
          initialName={list.name}
          initialDescription={list.description ?? ""}
          members={members.rows}
          total={members.total}
          readOnly={archived}
          pagination={
            <ListMembersPagination
              page={members.page}
              pageCount={members.pageCount}
              basePath={basePath}
            />
          }
        />
      ) : null}
    </div>
  );
}
