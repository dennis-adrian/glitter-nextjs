import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import type { ProofType } from "@/app/lib/festival_activites/types";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";
import {
  isStandActivityFilter,
  type StandActivityFilter,
} from "@/app/lib/maps/stand-filters";

/**
 * The map only draws an activity badge for a participant holding an approved
 * proof (see `requiresApprovedProof` in `app/lib/maps/activity-data.ts`), so
 * every type with a badge must ask for one, and in the shape its participant
 * flow can actually collect.
 *
 * Keyed by `StandActivityFilter` on purpose: adding a type to
 * `STAND_ACTIVITY_FILTERS` fails to compile until it says which material it
 * takes here, so the map and this rule cannot drift.
 *
 * - Coupon book: the promo text is what gets reviewed, printed and shown on the
 *   map, so `text` or `both`. `image` collects no promo.
 * - Stamp passport, sticker hunt, festival sticker: the proof is a design
 *   image. Their pages send `text`/`both` to the promo modal, which has no
 *   image uploader and asks for a promo that makes no sense for a stamp or a
 *   sticker.
 */
const MAP_BADGE_PROOF_TYPES: Record<StandActivityFilter, readonly ProofType[]> =
  {
    coupon_book: ["text", "both"],
    stamp_passport: ["image"],
    sticker_hunt: ["image"],
    festival_sticker: ["image"],
  };

/** Admin-facing names, shared with the form's select so messages match it. */
export const PROOF_TYPE_LABELS: Record<ProofType, string> = {
  image: "Imagen",
  text: "Texto",
  both: "Imagen y texto",
};

/**
 * Proof types an activity type accepts, or `null` when any choice (including
 * none) is fine because the type carries no map badge.
 */
export function getRequiredProofTypes(
  type: FestivalActivity["type"],
): readonly ProofType[] | null {
  return isStandActivityFilter(type) ? MAP_BADGE_PROOF_TYPES[type] : null;
}

function joinOptions(proofTypes: readonly ProofType[]): string {
  const labels = proofTypes.map(
    (proofType) => `«${PROOF_TYPE_LABELS[proofType]}»`,
  );
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} o ${labels[labels.length - 1]}`
    : labels[0];
}

/**
 * Which material a map-badge type takes and why, for the admin form. `null`
 * for types without a badge.
 */
export function getProofTypeRequirementHint(
  type: FestivalActivity["type"],
): string | null {
  const required = getRequiredProofTypes(type);
  if (!required) return null;
  const material = getMaterialConfig(type);
  return `Usá ${joinOptions(required)}. El mapa solo marca a quienes tienen ${material.article} ${material.label} ${material.pastParticiple}.`;
}

/**
 * Error for a proof type the activity type cannot work with, or `null` when it
 * is acceptable. Shared by the admin form schema and the server actions.
 */
export function getProofTypeRequirementError(
  type: FestivalActivity["type"],
  proofType: ProofType | null | undefined,
): string | null {
  const required = getRequiredProofTypes(type);
  if (!required) return null;
  if (proofType && required.includes(proofType)) return null;

  const material = getMaterialConfig(type);
  const reason = `el mapa solo marca a quienes tienen ${material.article} ${material.label} ${material.pastParticiple}`;
  return proofType
    ? `Este tipo de actividad necesita ${joinOptions(required)} como material: ${reason}.`
    : `Elegí ${joinOptions(required)}: ${reason}.`;
}
