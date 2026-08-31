import { STAND_SIZE, getStandPosition } from "@/app/components/maps/map-utils";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import type { MapStandLike } from "@/app/components/maps/map-types";

/**
 * Stands are placed freehand on the map, so two stands belonging to the same
 * participant sit no closer than two unrelated neighbours. Grouping is always
 * an explicit admin decision (stands.standGroupId); geometry is only used to
 * lay the joined shape out, never to decide that stands belong together.
 */

export type JointAxis = "row" | "column";

export type JointGroup<T extends MapStandLike = MapStandLike> = {
  id: number;
  /** Ordered along the group's axis, left to right or top to bottom */
  stands: T[];
  axis: JointAxis;
};

/** Positions come from freehand dragging, so exact equality is too strict */
const ALIGNMENT_TOLERANCE = 0.5;

type OccupantKeyStand = Pick<MapStandLike, "occupantKey" | "reservations">;

/**
 * Identifies who occupies a stand, counting both registered users and external
 * participants. Returns null when nobody holds it.
 */
export function getStandOccupantKey(stand: OccupantKeyStand): string | null {
  if (Object.prototype.hasOwnProperty.call(stand, "occupantKey")) {
    return stand.occupantKey ?? null;
  }

  const occupants = (stand.reservations ?? [])
    .filter((reservation) => reservation.status !== "rejected")
    .flatMap((reservation) => [
      ...reservation.participants.map((p) => `user-${p.user.id}`),
      ...(reservation.externalParticipants ?? []).map(
        ({ externalParticipant }) => `external-${externalParticipant.id}`,
      ),
    ]);

  if (occupants.length === 0) return null;
  return Array.from(new Set(occupants)).sort().join("|");
}

/**
 * The axis a set of stands lines up on, or null when they form neither a single
 * row nor a single column. A group that lines up on neither can never be drawn
 * as one clean outline, so admins are stopped from creating one.
 */
export function resolveJointAxis(
  stands: { positionLeft: number | null; positionTop: number | null }[],
): JointAxis | null {
  const positions = stands.map(getStandPosition);
  const sameTop = positions.every(
    (p) => Math.abs(p.top - positions[0].top) <= ALIGNMENT_TOLERANCE,
  );
  if (sameTop) return "row";

  const sameLeft = positions.every(
    (p) => Math.abs(p.left - positions[0].left) <= ALIGNMENT_TOLERANCE,
  );
  if (sameLeft) return "column";

  return null;
}

/**
 * The declared groups that should currently render as one joined stand: every
 * member is held by exactly the same participants, and the members line up in a
 * single row or column so the joined outline is a clean rectangle.
 */
export function resolveJointGroups<T extends MapStandLike>(
  stands: T[],
): JointGroup<T>[] {
  const byGroupId = new Map<number, T[]>();
  for (const stand of stands) {
    if (stand.standGroupId == null) continue;
    const members = byGroupId.get(stand.standGroupId) ?? [];
    members.push(stand);
    byGroupId.set(stand.standGroupId, members);
  }

  const groups: JointGroup<T>[] = [];
  for (const [id, members] of byGroupId) {
    if (members.length < 2) continue;

    const occupantKey = getStandOccupantKey(members[0]);
    if (occupantKey === null) continue;
    const sharedOccupants = members.every(
      (stand) => getStandOccupantKey(stand) === occupantKey,
    );
    if (!sharedOccupants) continue;

    const axis = resolveJointAxis(members);
    if (axis === null) continue;

    const ordered = [...members].sort((a, b) =>
      axis === "row"
        ? getStandPosition(a).left - getStandPosition(b).left
        : getStandPosition(a).top - getStandPosition(b).top,
    );
    groups.push({ id, stands: ordered, axis });
  }

  return groups;
}

/** Maps every grouped stand id to the joint group it renders as part of */
export function indexJointGroupsByStandId<T extends MapStandLike>(
  groups: JointGroup<T>[],
): Map<number, JointGroup<T>> {
  const index = new Map<number, JointGroup<T>>();
  for (const group of groups) {
    for (const stand of group.stands) index.set(stand.id, group);
  }
  return index;
}

/** Minimal stand shape needed to reason about group membership */
type StandGroupMembership = {
  id: number;
  standGroupId: number | null;
};

/**
 * Groups that fall below two members once the given stands move out of them,
 * and so cease to exist.
 *
 * Mirrors the server's pruneEmptyGroups: it deletes such a group, and the
 * ON DELETE SET NULL foreign key clears standGroupId on whichever member
 * stayed behind. Callers holding stands in local state need the same answer to
 * avoid leaving a stand pointing at a group that was just deleted.
 */
export function getPrunedGroupIds(
  stands: StandGroupMembership[],
  movedStandIds: Iterable<number>,
): Set<number> {
  const moved = new Set(movedStandIds);

  const priorGroupIds = new Set<number>();
  for (const stand of stands) {
    if (moved.has(stand.id) && stand.standGroupId != null) {
      priorGroupIds.add(stand.standGroupId);
    }
  }

  const survivors = new Map<number, number>();
  for (const stand of stands) {
    if (moved.has(stand.id) || stand.standGroupId == null) continue;
    if (!priorGroupIds.has(stand.standGroupId)) continue;
    survivors.set(
      stand.standGroupId,
      (survivors.get(stand.standGroupId) ?? 0) + 1,
    );
  }

  return new Set(
    Array.from(priorGroupIds).filter(
      (groupId) => (survivors.get(groupId) ?? 0) < 2,
    ),
  );
}

/**
 * The member whose own top-right corner is also the joined shape's: the
 * rightmost stand of a row, the topmost of a column. Members arrive ordered
 * along the axis, so an overlay anchored to this stand lands on the corner of
 * the whole unit rather than somewhere along its middle.
 */
function getJointGroupAnchor<T extends MapStandLike>(
  group: JointGroup<T>,
): T {
  return group.axis === "row"
    ? group.stands[group.stands.length - 1]
    : group.stands[0];
}

/**
 * Keeps one representative stand per joint group and leaves ungrouped stands
 * alone. Overlays that decorate individual stands need this: a joined group is
 * drawn as a single shape, so one marker per member would render twice on it.
 *
 * `jointGroups` should come from the same list the map renders, so the overlay
 * and the outlines can never disagree about what is joined.
 */
export function dedupeJointGroupMembers<T extends MapStandLike>(
  stands: T[],
  jointGroups: JointGroup<T>[],
): T[] {
  const index = indexJointGroupsByStandId(jointGroups);
  return stands.filter((stand) => {
    const group = index.get(stand.id);
    return !group || getJointGroupAnchor(group).id === stand.id;
  });
}

/**
 * The joint group a stand renders as part of, or null when it stands alone.
 * Cards use this to describe the whole unit the visitor actually tapped.
 */
export function findJointGroup<T extends MapStandLike>(
  stands: T[],
  standId: number | null | undefined,
): JointGroup<T> | null {
  if (standId == null) return null;
  const groups = resolveJointGroups(stands);
  return indexJointGroupsByStandId(groups).get(standId) ?? null;
}

/**
 * How a stand or joint group is named to visitors: "A9" alone, "A9 - A10" when
 * the stands were declared as one unit.
 *
 * Members arrive ordered by map position, which reads wrong in text once stand
 * numbers reach double digits, so they are re-sorted by label then number.
 * Sorting the formatted strings would not do: "A10" sorts before "A9".
 */
export function formatStandsLabel(
  stands: Array<{ label: string | null; standNumber: number }>,
): string {
  return [...stands]
    .sort((a, b) => {
      const byLabel = (a.label ?? "").localeCompare(b.label ?? "");
      if (byLabel !== 0) return byLabel;
      return a.standNumber - b.standNumber;
    })
    .map(formatStandLabel)
    .join(" - ");
}

/**
 * Products across a stand or joint group. Members can carry different
 * subcategories, so the labels are unioned and de-duplicated in map order.
 */
export function getStandsProducts(
  stands: Array<{
    standSubcategories?: Array<{ subcategory: { label: string } }>;
  }>,
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const stand of stands) {
    for (const standSubcategory of stand.standSubcategories ?? []) {
      const label = standSubcategory.subcategory.label;
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

export type JointGroupBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Positions along the group's axis where two members meet */
  seams: number[];
};

export function getJointGroupBounds(group: JointGroup): JointGroupBounds {
  const positions = group.stands.map(getStandPosition);
  const first = positions[0];

  const seams: number[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const end =
      (group.axis === "row" ? positions[i].left : positions[i].top) +
      STAND_SIZE;
    const nextStart =
      group.axis === "row" ? positions[i + 1].left : positions[i + 1].top;
    // Members do not touch, so the seam sits halfway across the gap
    seams.push((end + nextStart) / 2);
  }

  const last = positions[positions.length - 1];
  return group.axis === "row"
    ? {
        x: first.left,
        y: first.top,
        width: last.left + STAND_SIZE - first.left,
        height: STAND_SIZE,
        seams,
      }
    : {
        x: first.left,
        y: first.top,
        width: STAND_SIZE,
        height: last.top + STAND_SIZE - first.top,
        seams,
      };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Outline of a joined stand: a rounded rectangle over the whole group with a
 * concave notch pinching both long edges wherever two members meet.
 */
export function buildJointGroupPath(
  bounds: JointGroupBounds,
  axis: JointAxis,
  { cornerRadius = 0.8, notchRadius = 0.9 } = {},
): string {
  const { x, y, width, height, seams } = bounds;
  const r = Math.min(cornerRadius, width / 2, height / 2);
  const n = notchRadius;
  const right = x + width;
  const bottom = y + height;
  const parts: string[] = [];
  const ascending = [...seams].sort((a, b) => a - b);
  const descending = [...ascending].reverse();

  // Corners run clockwise (sweep 1); notches curve back into the shape (sweep 0)
  if (axis === "column") {
    parts.push(`M ${round(x + r)} ${round(y)}`);
    parts.push(`L ${round(right - r)} ${round(y)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(right)} ${round(y + r)}`);
    for (const seam of ascending) {
      parts.push(`L ${round(right)} ${round(seam - n)}`);
      parts.push(`A ${n} ${n} 0 0 0 ${round(right)} ${round(seam + n)}`);
    }
    parts.push(`L ${round(right)} ${round(bottom - r)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(right - r)} ${round(bottom)}`);
    parts.push(`L ${round(x + r)} ${round(bottom)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(x)} ${round(bottom - r)}`);
    for (const seam of descending) {
      parts.push(`L ${round(x)} ${round(seam + n)}`);
      parts.push(`A ${n} ${n} 0 0 0 ${round(x)} ${round(seam - n)}`);
    }
    parts.push(`L ${round(x)} ${round(y + r)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}`);
  } else {
    parts.push(`M ${round(x + r)} ${round(y)}`);
    for (const seam of ascending) {
      parts.push(`L ${round(seam - n)} ${round(y)}`);
      parts.push(`A ${n} ${n} 0 0 0 ${round(seam + n)} ${round(y)}`);
    }
    parts.push(`L ${round(right - r)} ${round(y)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(right)} ${round(y + r)}`);
    parts.push(`L ${round(right)} ${round(bottom - r)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(right - r)} ${round(bottom)}`);
    for (const seam of descending) {
      parts.push(`L ${round(seam + n)} ${round(bottom)}`);
      parts.push(`A ${n} ${n} 0 0 0 ${round(seam - n)} ${round(bottom)}`);
    }
    parts.push(`L ${round(x + r)} ${round(bottom)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(x)} ${round(bottom - r)}`);
    parts.push(`L ${round(x)} ${round(y + r)}`);
    parts.push(`A ${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}`);
  }

  parts.push("Z");
  return parts.join(" ");
}
