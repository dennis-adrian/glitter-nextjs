import {
  EMPTY_STAND_FILTERS,
  STAND_ACTIVITY_FILTERS,
  type StandActivityFilter,
  type StandFilters,
  type StandStatusFilter,
} from "@/app/lib/maps/stand-filters";

/**
 * The festival map's filters, as they appear in a shared link:
 * `?sector=12&status=occupied&activity=stamp_passport&q=ana`.
 *
 * Activities repeat the key rather than joining values with commas, which the
 * URL would escape to `%2C` and make a pasted link unreadable.
 */
export const FESTIVAL_MAP_URL_PARAMS = {
  query: "q",
  sector: "sector",
  status: "status",
  activity: "activity",
} as const;

/** Long enough for any name or stand label; a pasted essay is cut short. */
const MAX_QUERY_LENGTH = 100;

export type FestivalMapUrlState = {
  query: string;
  /** -1 is every sector, the default view. */
  sectorIndex: number;
  standFilters: StandFilters;
};

export type FestivalMapUrlContext = {
  sectors: { id: number }[];
  selectableStatuses: Exclude<StandStatusFilter, "all">[];
  selectableActivities: StandActivityFilter[];
  /** The dedicated map page has no text filter, so it neither reads nor writes `q`. */
  includeQuery: boolean;
};

type ReadableSearchParams = Pick<URLSearchParams, "get" | "getAll">;

/**
 * Reads a link back into filters, keeping only what the festival can show:
 * a stale link (a sector since removed, an activity with no stands yet) opens
 * on the closest valid view rather than on a filter the visitor cannot undo
 * from the legend.
 */
export function parseFestivalMapUrlState(
  params: ReadableSearchParams,
  {
    sectors,
    selectableStatuses,
    selectableActivities,
    includeQuery,
  }: FestivalMapUrlContext,
): FestivalMapUrlState {
  const query = includeQuery
    ? (params.get(FESTIVAL_MAP_URL_PARAMS.query) ?? "").slice(
        0,
        MAX_QUERY_LENGTH,
      )
    : "";

  const sectorParam = params.get(FESTIVAL_MAP_URL_PARAMS.sector);
  const sectorId = sectorParam ? Number(sectorParam) : Number.NaN;
  const sectorIndex = Number.isInteger(sectorId)
    ? sectors.findIndex((sector) => sector.id === sectorId)
    : -1;

  const statusParam = params.get(FESTIVAL_MAP_URL_PARAMS.status);
  const status: StandStatusFilter =
    selectableStatuses.find((value) => value === statusParam) ?? "all";

  const requestedActivities = new Set(
    params.getAll(FESTIVAL_MAP_URL_PARAMS.activity),
  );
  // Same rule as the legend: badges only sit on occupied stands, so pairing
  // them with "Disponible" could only ever empty the map.
  const activities =
    status === "available"
      ? []
      : STAND_ACTIVITY_FILTERS.filter(
          (activity) =>
            requestedActivities.has(activity) &&
            selectableActivities.includes(activity),
        );

  return {
    query,
    sectorIndex,
    standFilters:
      status === "all" && activities.length === 0
        ? EMPTY_STAND_FILTERS
        : { status, activities },
  };
}

export function hasFestivalMapUrlState(state: FestivalMapUrlState): boolean {
  return (
    state.query.trim().length > 0 ||
    state.sectorIndex !== -1 ||
    state.standFilters.status !== "all" ||
    state.standFilters.activities.length > 0
  );
}

/**
 * The search string for `state`, written over `search` so parameters the map
 * does not own (campaign tags, for one) survive. Defaults are left out, so an
 * unfiltered map keeps a clean URL. Returns "" or a string starting with "?".
 */
export function writeFestivalMapUrlState(
  search: string,
  state: FestivalMapUrlState,
  {
    sectors,
    includeQuery,
  }: Pick<FestivalMapUrlContext, "sectors" | "includeQuery">,
): string {
  const params = new URLSearchParams(search);

  if (includeQuery) {
    const query = state.query.trim();
    if (query) params.set(FESTIVAL_MAP_URL_PARAMS.query, query);
    else params.delete(FESTIVAL_MAP_URL_PARAMS.query);
  }

  const sector = sectors[state.sectorIndex];
  if (state.sectorIndex !== -1 && sector) {
    params.set(FESTIVAL_MAP_URL_PARAMS.sector, String(sector.id));
  } else {
    params.delete(FESTIVAL_MAP_URL_PARAMS.sector);
  }

  if (state.standFilters.status !== "all") {
    params.set(FESTIVAL_MAP_URL_PARAMS.status, state.standFilters.status);
  } else {
    params.delete(FESTIVAL_MAP_URL_PARAMS.status);
  }

  params.delete(FESTIVAL_MAP_URL_PARAMS.activity);
  // Canonical order, so the same selection always produces the same link.
  for (const activity of STAND_ACTIVITY_FILTERS) {
    if (state.standFilters.activities.includes(activity)) {
      params.append(FESTIVAL_MAP_URL_PARAMS.activity, activity);
    }
  }

  const next = params.toString();
  return next ? `?${next}` : "";
}
