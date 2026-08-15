"use client";

import {
  buildColumns,
  columnTitles,
} from "@/app/components/organisms/festivals/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";

type FestivalsTableProps = {
  festivals: FestivalWithDates[];
  fastPassEnabled: boolean;
};

export default function FestivalsTable({
  festivals,
  fastPassEnabled,
}: FestivalsTableProps) {
  return (
    <DataTable
      columns={buildColumns(fastPassEnabled)}
      data={festivals}
      columnTitles={columnTitles}
    />
  );
}
