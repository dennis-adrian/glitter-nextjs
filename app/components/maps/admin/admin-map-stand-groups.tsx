"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { STAND_SIZE } from "@/app/components/maps/map-utils";
import { resolveJointAxis } from "@/app/lib/stands/groups";

type AdminMapStandGroupsProps = {
  stands: StandWithReservationsWithParticipants[];
  /** Live editor positions, so the outline follows stands while dragging */
  positions: Map<number, { left: number; top: number }>;
};

const PADDING = 1;
const CORNER_RADIUS = 1.4;

const ALIGNED_STROKE = "rgba(139, 92, 246, 0.9)"; // violet-500
const MISALIGNED_STROKE = "rgba(217, 119, 6, 0.95)"; // amber-600

type GroupOutline = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  aligned: boolean;
};

function buildOutlines(
  stands: StandWithReservationsWithParticipants[],
  positions: Map<number, { left: number; top: number }>,
): GroupOutline[] {
  const byGroupId = new Map<number, { left: number; top: number }[]>();
  for (const stand of stands) {
    if (stand.standGroupId == null) continue;
    const position = positions.get(stand.id);
    if (!position) continue;
    const members = byGroupId.get(stand.standGroupId) ?? [];
    members.push(position);
    byGroupId.set(stand.standGroupId, members);
  }

  const outlines: GroupOutline[] = [];
  for (const [id, members] of byGroupId) {
    if (members.length < 2) continue;

    const lefts = members.map((m) => m.left);
    const tops = members.map((m) => m.top);
    const x = Math.min(...lefts);
    const y = Math.min(...tops);

    outlines.push({
      id,
      x: x - PADDING,
      y: y - PADDING,
      width: Math.max(...lefts) + STAND_SIZE - x + PADDING * 2,
      height: Math.max(...tops) + STAND_SIZE - y + PADDING * 2,
      aligned:
        resolveJointAxis(
          members.map((m) => ({ positionLeft: m.left, positionTop: m.top })),
        ) !== null,
    });
  }

  return outlines;
}

/**
 * Marks admin-declared stand groups in the map editor. The editor is the only
 * place a group can be broken — dragging a member out of line stops the public
 * map from ever drawing it joined — so misaligned groups are called out amber.
 */
export default function AdminMapStandGroups({
  stands,
  positions,
}: AdminMapStandGroupsProps) {
  const outlines = buildOutlines(stands, positions);
  if (outlines.length === 0) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      {outlines.map((outline) => (
        <g
          key={`group-${outline.id}`}
          role={outline.aligned ? undefined : "img"}
          aria-label={
            outline.aligned ? undefined : `Grupo ${outline.id} sin alinear`
          }
        >
          <rect
            x={outline.x}
            y={outline.y}
            width={outline.width}
            height={outline.height}
            rx={CORNER_RADIUS}
            fill="none"
            stroke={outline.aligned ? ALIGNED_STROKE : MISALIGNED_STROKE}
            strokeWidth={0.25}
            strokeDasharray={outline.aligned ? "1,0.6" : "0.6,0.5"}
          />
          {!outline.aligned && (
            <text
              x={outline.x + 0.4}
              y={outline.y + 1.6}
              fontSize={1.6}
              fontWeight={700}
              fill={MISALIGNED_STROKE}
              aria-hidden="true"
              style={{ userSelect: "none" }}
            >
              ⚠ sin alinear
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
