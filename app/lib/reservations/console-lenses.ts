import type { DataTableInitialState } from "@/app/components/ui/data_table/data-table";

/**
 * The three questions an admin brings to a festival's reservations.
 *
 * They were previously two routes over the same join — `/reservations` rooted
 * at the reservation, `/payments` rooted at its single invoice — which drifted
 * into showing different answers about the same row. A lens is a column preset
 * over one table, not a separate page, and lives in the URL so a queue can be
 * linked to.
 */
export const CONSOLE_LENSES = ["reservas", "cobros", "creditos"] as const;

export type ConsoleLens = (typeof CONSOLE_LENSES)[number];

export const DEFAULT_LENS: ConsoleLens = "reservas";

export function parseLens(value: string | string[] | undefined): ConsoleLens {
  const candidate = Array.isArray(value) ? value[0] : value;
  return CONSOLE_LENSES.includes(candidate as ConsoleLens)
    ? (candidate as ConsoleLens)
    : DEFAULT_LENS;
}

export const LENS_LABELS: Record<ConsoleLens, string> = {
  reservas: "Reservas",
  cobros: "Cobros",
  creditos: "Créditos",
};

export const LENS_DESCRIPTIONS: Record<ConsoleLens, string> = {
  reservas: "Quién ocupa qué, y en qué estado está cada reserva",
  cobros: "Qué se debe, qué lo cubre y qué espera revisión",
  creditos: "Reservas con créditos aplicados o extras pagados con crédito",
};

/**
 * Which columns each lens shows. Every column stays defined; the view options
 * menu can bring back anything a preset hides.
 */
const VISIBLE: Record<ConsoleLens, string[]> = {
  reservas: [
    "select",
    "id",
    "stand",
    "artists",
    "participantCategory",
    "status",
    "coverage",
    "dueAt",
    "collaborators",
    "createdAt",
    "actions",
  ],
  cobros: [
    "select",
    "id",
    "stand",
    "owner",
    "participantCategory",
    "status",
    "coverage",
    "totalAmount",
    "creditAmount",
    "cashAmount",
    "outstandingAmount",
    "proof",
    "reviewAge",
    "dueAt",
    "createdAt",
    "actions",
  ],
  creditos: [
    "select",
    "id",
    "stand",
    "owner",
    "participantCategory",
    "status",
    "coverage",
    "totalAmount",
    "creditAmount",
    "outstandingAmount",
    "features",
    "createdAt",
    "actions",
  ],
};

const ALL_COLUMNS = [
  "select",
  "id",
  "stand",
  "artists",
  "owner",
  "participantCategory",
  "status",
  "coverage",
  "totalAmount",
  "creditAmount",
  "cashAmount",
  "outstandingAmount",
  "proof",
  "reviewAge",
  "dueAt",
  "features",
  "creditSource",
  "collaborators",
  "festivalId",
  "createdAt",
  "actions",
];

export function lensInitialState(lens: ConsoleLens): DataTableInitialState {
  const visible = new Set(VISIBLE[lens]);
  const columnVisibility: Record<string, boolean> = {};
  for (const column of ALL_COLUMNS) {
    columnVisibility[column] = visible.has(column);
  }

  return {
    columnVisibility,
    columnFilters: LENS_FILTERS[lens],
  };
}

/**
 * What each lens opens on.
 *
 * These are defaults, not restrictions: both appear in the filter bar as
 * removable chips, so an admin can see why rows are missing and widen the view
 * without leaving the lens.
 */
const LENS_FILTERS: Record<
  ConsoleLens,
  NonNullable<DataTableInitialState["columnFilters"]>
> = {
  reservas: [],
  // The settlement queue opens on what is waiting for a decision.
  cobros: [{ id: "coverage", value: ["under_review", "partial", "overdue"] }],
  // "Reservas con créditos aplicados o extras pagados con crédito" — the
  // subtitle promised a narrowed list and the lens showed every reservation in
  // the festival, which made the tab indistinguishable from Cobros.
  creditos: [{ id: "creditSource", value: ["invoice", "features"] }],
};
