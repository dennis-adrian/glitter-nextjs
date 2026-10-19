"use client";

import {
  ALL_FESTIVALS_FILTER_VALUE,
  columns,
  columnTitles,
  DISCOUNT_CODE_STATUS_OPTIONS,
  DiscountCodeAudience,
  DiscountCodeExpiry,
  DiscountCodeStatusDot,
  DiscountCodeUses,
} from "@/app/components/organisms/discount_codes/table/columns";
import DiscountCodeActionsMenu from "@/app/components/organisms/discount_codes/table/discount-code-actions-menu";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import type { DiscountCodeWithRelations } from "@/app/lib/discount_codes/definitions";
import {
  DEFAULT_DISCOUNT_CODE_STATUSES,
  formatDiscountValue,
} from "@/app/lib/discount_codes/utils";

type DiscountCodesTableProps = {
  discountCodes: DiscountCodeWithRelations[];
};

function DiscountCodeMobileRow({
  discountCode,
}: {
  discountCode: DiscountCodeWithRelations;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-0.5 text-sm font-semibold">
            {discountCode.code.toUpperCase()}
          </code>
          <span className="font-medium tabular-nums">
            {formatDiscountValue(discountCode)}
          </span>
          <DiscountCodeStatusDot discountCode={discountCode} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Festival</dt>
          <dd className="truncate">{discountCode.festival?.name ?? "Todos"}</dd>
          <dt className="text-muted-foreground">Usuarios</dt>
          <dd className="min-w-0">
            <DiscountCodeAudience discountCode={discountCode} />
          </dd>
          <dt className="text-muted-foreground">Usos</dt>
          <dd>
            <DiscountCodeUses discountCode={discountCode} />
          </dd>
          <dt className="text-muted-foreground">Vence</dt>
          <dd>
            <DiscountCodeExpiry discountCode={discountCode} />
          </dd>
        </dl>
      </div>
      <DiscountCodeActionsMenu
        discountCode={discountCode}
        triggerClassName="-mr-1 -mt-1 shrink-0"
      />
    </div>
  );
}

function festivalFilterOptions(discountCodes: DiscountCodeWithRelations[]) {
  const festivals = new Map<number, string>();
  let hasGlobal = false;
  for (const code of discountCodes) {
    if (code.festival) festivals.set(code.festival.id, code.festival.name);
    else hasGlobal = true;
  }
  const options = [...festivals]
    .sort(([, a], [, b]) => a.localeCompare(b, "es"))
    .map(([id, name]) => ({ value: String(id), label: name }));
  return hasGlobal
    ? [
        { value: ALL_FESTIVALS_FILTER_VALUE, label: "Todos los festivales" },
        ...options,
      ]
    : options;
}

export default function DiscountCodesTable({
  discountCodes,
}: DiscountCodesTableProps) {
  const festivalOptions = festivalFilterOptions(discountCodes);

  return (
    <DataTable
      columns={columns}
      data={discountCodes}
      columnTitles={columnTitles}
      getRowId={(row) => String(row.id)}
      searchPlaceholder="Buscar por código, festival o usuario"
      filters={[
        {
          columnId: "status",
          label: "Estado",
          options: DISCOUNT_CODE_STATUS_OPTIONS,
        },
        // Only worth a control once codes are split across festivals.
        ...(festivalOptions.length > 1
          ? [
              {
                columnId: "festival",
                label: "Festival",
                options: festivalOptions,
              },
            ]
          : []),
      ]}
      initialState={{
        // Expired codes stay out of the way until asked for; the chips say
        // so, and clearing them brings every code back.
        columnFilters: [
          { id: "status", value: DEFAULT_DISCOUNT_CODE_STATUSES },
        ],
      }}
      renderMobileRow={(discountCode) => (
        <DiscountCodeMobileRow discountCode={discountCode} />
      )}
      emptyMessage="No hay códigos que coincidan."
    />
  );
}
