import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import type { UserCategory } from "@/app/api/users/definitions";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { formatStandLabel } from "@/app/lib/stands/helpers";

export type ParticipantSearchEntry = {
  userId: number;
  category: UserCategory;
  displayName: string;
  imageUrl: string | null;
  standLabel: string;
  sectorName: string;
  sectorIndex: number;
  stand: StandWithReservationsWithParticipants;
};

/**
 * Below this length a query has too few trigrams for similarity to mean much,
 * and short common fragments drag in the whole roster. Measured over every
 * four-letter prefix of a real 186-participant festival: at four characters
 * "arte" alone pulled 14 approximate matches on top of its 3 real ones, and the
 * roster as a whole gained 71 of them; at five, 4.
 */
const MIN_FUZZY_QUERY_LENGTH = 5;
/** Postgres' own `pg_trgm.similarity_threshold` default. */
const MIN_TRIGRAM_SIMILARITY = 0.3;

/**
 * Comparison form for every participant search on the page: diacritics folded,
 * lowercased, and every separator dropped \u2014 the same collapse the reservation
 * partner search performs in SQL, so "KAHORI" finds a participant written
 * "K A H O R I", and "A-1" finds stand A1.
 *
 * Letters and digits of any script survive, so a name written in kana stays
 * searchable in kana.
 */
export function normalizeParticipantSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * `pg_trgm`'s trigram set: the value padded with two leading spaces and one
 * trailing, cut into three-character windows.
 */
function trigramsOf(value: string) {
  const padded = `  ${value} `;
  const grams = new Set<string>();

  for (let index = 0; index + 3 <= padded.length; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }

  return grams;
}

/**
 * Jaccard overlap of two trigram sets \u2014 the metric Postgres `similarity()`
 * uses, so a typo is scored here the way the reservation search would score it.
 * Both arguments must already be normalized.
 */
export function trigramSimilarity(left: string, right: string) {
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;

  const leftGrams = trigramsOf(left);
  const rightGrams = trigramsOf(right);
  let shared = 0;

  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) shared += 1;
  }

  const union = leftGrams.size + rightGrams.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Best trigram score for a field: the query against the whole collapsed value,
 * and against each word in it.
 *
 * The word pass is what makes typos reachable in long names. Jaccard punishes a
 * length gap, so "desing" scores near nothing against the whole of "Génesis •
 * Design & Illustration" however obviously it means "Design".
 */
export function fieldSimilarity(value: string, normalizedQuery: string) {
  let best = trigramSimilarity(
    normalizeParticipantSearch(value),
    normalizedQuery,
  );

  for (const word of value.split(/[^\p{L}\p{N}]+/u)) {
    if (best === 1) break;
    const normalizedWord = normalizeParticipantSearch(word);
    if (normalizedWord.length === 0) continue;
    best = Math.max(best, trigramSimilarity(normalizedWord, normalizedQuery));
  }

  return best;
}

/**
 * Whether one field answers the query, allowing for a typo. The query must
 * already be normalized; the field is normalized here.
 */
export function fieldMatchesQuery(value: string, normalizedQuery: string) {
  const normalizedValue = normalizeParticipantSearch(value);
  if (normalizedValue.length === 0) return false;
  if (normalizedValue.includes(normalizedQuery)) return true;

  return (
    normalizedQuery.length >= MIN_FUZZY_QUERY_LENGTH &&
    fieldSimilarity(value, normalizedQuery) >= MIN_TRIGRAM_SIMILARITY
  );
}

export function buildParticipantSearchEntries(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
): ParticipantSearchEntry[] {
  const entries: ParticipantSearchEntry[] = [];

  sectors.forEach((sector, sectorIndex) => {
    sector.stands.forEach((stand) => {
      if (stand.status === "disabled") return;
      const standLabel = formatStandLabel(stand);

      stand.reservations
        .filter((reservation) => reservation.status !== "rejected")
        .flatMap((reservation) => reservation.participants)
        .forEach((participant) => {
          if (!participant.user.displayName) return;
          entries.push({
            userId: participant.user.id,
            category: participant.user.category,
            displayName: participant.user.displayName,
            imageUrl: participant.user.imageUrl,
            standLabel,
            sectorName: sector.name,
            sectorIndex,
            stand,
          });
        });
    });
  });

  return entries;
}

/**
 * How well an entry answers the query. Highest tier first:
 *
 *   3  the query *is* this stand — someone typing "A1" wants stand A1, not a
 *      participant whose name happens to contain those characters
 *   2  the name starts with the query
 *   1  the name or the stand label contains the query
 *   0  the name is within a typo of the query
 *
 * Returns null when the entry does not answer the query at all.
 */
function scoreEntry(
  entry: ParticipantSearchEntry,
  normalizedQuery: string,
  canFuzzyMatch: boolean,
) {
  const name = normalizeParticipantSearch(entry.displayName);
  const stand = normalizeParticipantSearch(entry.standLabel);
  const similarity = canFuzzyMatch
    ? fieldSimilarity(entry.displayName, normalizedQuery)
    : 0;

  if (stand === normalizedQuery) return { tier: 3, similarity };
  if (name.startsWith(normalizedQuery)) return { tier: 2, similarity };
  if (name.includes(normalizedQuery) || stand.includes(normalizedQuery)) {
    return { tier: 1, similarity };
  }
  if (similarity >= MIN_TRIGRAM_SIMILARITY) return { tier: 0, similarity };

  return null;
}

/**
 * Entries answering the query, best first. Returns every match — the caller
 * decides how many to show — and an empty list for an empty query.
 *
 * Typo tolerance sits in the lowest tier on purpose: an approximate hit should
 * never displace a name that literally contains what was typed.
 */
export function rankParticipantSearchEntries(
  entries: ParticipantSearchEntry[],
  query: string,
): ParticipantSearchEntry[] {
  const normalizedQuery = normalizeParticipantSearch(query);
  if (normalizedQuery.length === 0) return [];

  const canFuzzyMatch = normalizedQuery.length >= MIN_FUZZY_QUERY_LENGTH;
  const scored: {
    entry: ParticipantSearchEntry;
    tier: number;
    similarity: number;
  }[] = [];

  for (const entry of entries) {
    const score = scoreEntry(entry, normalizedQuery, canFuzzyMatch);
    if (score) scored.push({ entry, ...score });
  }

  scored.sort(
    (a, b) =>
      b.tier - a.tier ||
      b.similarity - a.similarity ||
      a.entry.displayName.localeCompare(b.entry.displayName, "es"),
  );

  return scored.map((match) => match.entry);
}
