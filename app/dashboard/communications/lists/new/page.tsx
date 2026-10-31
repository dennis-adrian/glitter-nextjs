import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NewFixedListEditor } from "@/app/components/communications/admin/fixed-list-editor";
import ListFilterEditor from "@/app/components/communications/admin/list-filter-editor";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import {
  DISTRIBUTION_LIST_KIND_DESCRIPTIONS,
  EMPTY_DISTRIBUTION_LIST_FILTER,
} from "@/app/lib/distribution_lists/definitions";
import { fetchListFilterOptions } from "@/app/lib/distribution_lists/queries";

export const metadata: Metadata = {
  title: "Nueva lista · Comunicaciones",
};

export default async function NewDistributionListPage(props: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  await requireCommunicationsAdmin();
  const { kind = "filter" } = await props.searchParams;
  if (kind !== "filter" && kind !== "fixed") notFound();

  const options = kind === "filter" ? await fetchListFilterOptions() : null;
  if (kind === "filter" && !options) notFound();

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Nueva lista</h2>
          <p className="text-sm text-muted-foreground">
            {DISTRIBUTION_LIST_KIND_DESCRIPTIONS[kind]}
          </p>
        </div>
        <Link
          href="/dashboard/communications/lists"
          className="text-sm text-muted-foreground hover:underline"
        >
          Volver a las listas
        </Link>
      </div>
      {kind === "filter" && options ? (
        <ListFilterEditor
          listId={null}
          initialFilter={EMPTY_DISTRIBUTION_LIST_FILTER}
          options={options}
        />
      ) : (
        <NewFixedListEditor />
      )}
    </div>
  );
}
