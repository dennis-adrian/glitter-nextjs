import { z } from "zod";

import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { stateOptions } from "@/app/lib/utils";

/**
 * Distribution lists (docs/IMPLEMENTATION-comunicados.md A3, B2, B3, G8).
 * Client-safe: the editors validate with the same schemas the actions do.
 */

export const DISTRIBUTION_LIST_NAME_MAX_LENGTH = 60;
export const DISTRIBUTION_LIST_DESCRIPTION_MAX_LENGTH = 200;
/** A fixed list stays small enough to resolve in one statement at send. */
export const DISTRIBUTION_LIST_MAX_MEMBERS = 3_000;
/** Members shown per page, on the Confirmados page and the fixed editor. */
export const DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE = 50;
/** Names the filter editor shows under its live count. */
export const DISTRIBUTION_LIST_PREVIEW_NAMES = 20;
/** People one "Agregar" adds to a fixed list at most. */
export const DISTRIBUTION_LIST_ADD_BATCH_MAX = 100;

/** Computed lists are named this way, so a saved list may not be. */
export const CONFIRMADOS_LIST_PREFIX = "Confirmados ·";

export function confirmadosListName(festivalName: string) {
  return `${CONFIRMADOS_LIST_PREFIX} ${festivalName}`;
}

export const CONFIRMADOS_LIST_EXPLANATION =
  "Quienes tienen una reserva confirmada en el festival, titulares y acompañantes. Se calcula en cada envío.";

export const DISTRIBUTION_LIST_KIND_LABELS = {
  filter: "Con filtros",
  fixed: "Elegida a mano",
} as const;
export type DistributionListKind = keyof typeof DISTRIBUTION_LIST_KIND_LABELS;

export const DISTRIBUTION_LIST_KIND_DESCRIPTIONS = {
  filter: "Con filtros (se calcula de nuevo en cada envío)",
  fixed: "Elegida a mano (siempre las mismas personas)",
} as const satisfies Record<DistributionListKind, string>;

export const DISTRIBUTION_LIST_AREAS = [
  "illustration",
  "gastronomy",
  "entrepreneurship",
] as const;
export type DistributionListArea = (typeof DISTRIBUTION_LIST_AREAS)[number];

export const DISTRIBUTION_LIST_AREA_LABELS = {
  illustration: "Ilustración",
  gastronomy: "Gastronomía",
  entrepreneurship: "Emprendimiento",
} as const satisfies Record<DistributionListArea, string>;

/**
 * The profile categories an area matches. Illustration also matches the
 * deprecated `new_artist`, as stands do (`profileCategoryForStandMatch`).
 */
export function expandDistributionListAreas(
  areas: readonly DistributionListArea[],
): string[] {
  return [
    ...new Set(
      areas.flatMap((area) =>
        area === "illustration" ? ["illustration", "new_artist"] : [area],
      ),
    ),
  ];
}

/** The departamentos a profile's `state` can hold. */
export const STATE_VALUES = stateOptions.map((option) => option.value) as [
  string,
  ...string[],
];

const serialId = z.number().int().positive().max(MAX_SERIAL_ID);

function uniqueIds(max: number) {
  return z
    .array(serialId)
    .max(max)
    .default([])
    .transform((ids) => [...new Set(ids)]);
}

/**
 * A filter list's criteria, version 1. Attributes are ANDed; the values within
 * one are ORed; an empty attribute matches everyone. Strict, so a stored
 * filter with a field this version does not know fails to parse instead of
 * quietly matching more people.
 */
export const DistributionListFilterV1 = z
  .object({
    v: z.literal(1),
    areas: z
      .array(z.enum(DISTRIBUTION_LIST_AREAS))
      .max(DISTRIBUTION_LIST_AREAS.length)
      .default([])
      .transform((areas) => [...new Set(areas)]),
    subcategoryIds: uniqueIds(30),
    states: z
      .array(z.enum(STATE_VALUES))
      .max(STATE_VALUES.length)
      .default([])
      .transform((states) => [...new Set(states)]),
    /** Confirmed at any of these festivals. */
    confirmedAtFestivalIds: uniqueIds(20),
    /** And confirmed at none of these. */
    notConfirmedAtFestivalIds: uniqueIds(20),
    includePaused: z.boolean().default(true),
  })
  .strict();
export type DistributionListFilter = z.output<typeof DistributionListFilterV1>;
export type DistributionListFilterInput = z.input<
  typeof DistributionListFilterV1
>;

export const EMPTY_DISTRIBUTION_LIST_FILTER: DistributionListFilter = {
  v: 1,
  areas: [],
  subcategoryIds: [],
  states: [],
  confirmedAtFestivalIds: [],
  notConfirmedAtFestivalIds: [],
  includePaused: true,
};

export function isEmptyDistributionListFilter(filter: DistributionListFilter) {
  return (
    filter.areas.length === 0 &&
    filter.subcategoryIds.length === 0 &&
    filter.states.length === 0 &&
    filter.confirmedAtFestivalIds.length === 0 &&
    filter.notConfirmedAtFestivalIds.length === 0 &&
    filter.includePaused
  );
}

/**
 * A stored filter, or null when it no longer parses. Null must refuse
 * whatever was about to use it: it never evaluates to everyone.
 */
export function parseStoredDistributionListFilter(
  stored: unknown,
): DistributionListFilter | null {
  const parsed = DistributionListFilterV1.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export function unreadableListFilterMessage(listName: string) {
  return `La lista «${listName}» tiene un filtro que ya no se puede leer; editala.`;
}

export const DistributionListNameSchema = z
  .string()
  .trim()
  .min(1, "Escribí un nombre.")
  .max(
    DISTRIBUTION_LIST_NAME_MAX_LENGTH,
    `Usá ${DISTRIBUTION_LIST_NAME_MAX_LENGTH} caracteres como máximo.`,
  )
  .refine(
    (name) =>
      !name
        .toLocaleLowerCase("es")
        .startsWith(CONFIRMADOS_LIST_PREFIX.toLocaleLowerCase("es")),
    `«${CONFIRMADOS_LIST_PREFIX}» queda para las listas de cada festival.`,
  );

const descriptionSchema = z
  .string()
  .trim()
  .max(
    DISTRIBUTION_LIST_DESCRIPTION_MAX_LENGTH,
    `Usá ${DISTRIBUTION_LIST_DESCRIPTION_MAX_LENGTH} caracteres como máximo.`,
  )
  .nullish()
  // Left out keeps what is stored; blank clears it.
  .transform((description) =>
    description === undefined ? undefined : description || null,
  );

export const CreateDistributionListSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("filter"),
    name: DistributionListNameSchema,
    description: descriptionSchema,
    filter: DistributionListFilterV1,
  }),
  z.object({
    kind: z.literal("fixed"),
    name: DistributionListNameSchema,
    description: descriptionSchema,
    memberIds: uniqueIds(DISTRIBUTION_LIST_ADD_BATCH_MAX),
  }),
]);
export type CreateDistributionListInput = z.input<
  typeof CreateDistributionListSchema
>;

/** The kind is never written after creation, so it is not an input here. */
export const UpdateDistributionListSchema = z.object({
  listId: serialId,
  name: DistributionListNameSchema,
  description: descriptionSchema,
  /** Required for a filter list, refused for a fixed one. */
  filter: DistributionListFilterV1.optional(),
});
export type UpdateDistributionListInput = z.input<
  typeof UpdateDistributionListSchema
>;

export const DistributionListMembersSchema = z.object({
  listId: serialId,
  userIds: z
    .array(serialId)
    .min(1)
    .max(DISTRIBUTION_LIST_ADD_BATCH_MAX)
    .transform((ids) => [...new Set(ids)]),
});

export const DistributionListIdSchema = serialId;

/** Where a group of recipients comes from: a festival's or a saved list. */
export const DistributionListSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("festival"), festivalId: serialId }),
  z.object({ kind: z.literal("list"), listId: serialId }),
]);
export type DistributionListSource = z.infer<
  typeof DistributionListSourceSchema
>;

/** The one count every screen shows (B4). */
export type AudienceCount = {
  /** Who can receive it today. */
  eligible: number;
  /** Members who cannot, for a reason in `PARTICIPANT_SKIP_REASONS`. */
  skipped: number;
};

export function formatAudienceCount(count: number) {
  return count.toLocaleString("es-BO");
}

/** "Pueden recibirlo hoy: 312 · 8 no lo reciben". */
export function audienceCountLine({ eligible, skipped }: AudienceCount) {
  const line = `Pueden recibirlo hoy: ${formatAudienceCount(eligible)}`;
  return skipped > 0
    ? `${line} · ${formatAudienceCount(skipped)} no lo reciben`
    : line;
}

export function archiveDistributionListPrompt(name: string) {
  return `¿Archivar «${name}»? Deja de aparecer al elegir destinatarios. Los borradores y los programados que la usan la siguen usando; los enviados no cambian.`;
}

/** A list as the lists page and the pickers show it. */
export type DistributionListSummary = {
  id: number;
  name: string;
  description: string | null;
  kind: DistributionListKind;
  /** Null when its filter no longer parses: nothing can use it until edited. */
  count: AudienceCount | null;
  updatedAt: Date;
};

/** A festival's computed list, as the lists page and the pickers show it. */
export type FestivalListSummary = {
  festivalId: number;
  festivalName: string;
  festivalStatus: string;
  startDate: Date | null;
  count: AudienceCount;
};

/** One person on a list, with whether they can receive it today. */
export type DistributionListMember = {
  userId: number;
  name: string;
  email: string;
  imageUrl: string | null;
  /** The B5 label, or null when they can receive it. */
  skipReason: string | null;
};

/** On a Confirmados list: how the person holds the reservation(s). */
export type ConfirmadosMember = DistributionListMember & {
  isOwner: boolean;
  isPartner: boolean;
};

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
};
