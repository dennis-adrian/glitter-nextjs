/**
 * Isometric table graphics for the full-table feature (PRD §7.5).
 *
 * The projection is lifted from `public/img/stand-table-half-60x120.svg` so
 * these read as the same object: one stand is half a table (120 × 60 cm) and a
 * declared pair is a whole one (240 × 60 cm). Geometry is derived from two edge
 * vectors rather than hand-placed points, which is what lets the same drawing
 * render one half, two halves, or two halves with one muted.
 *
 * The picture is decorative. Every state it depicts is also stated in text by
 * the panel around it, and unavailability is carried by a hatch pattern as well
 * as colour so it survives greyscale and colour-blind viewing.
 */

import type { CSSProperties } from "react";

/** Short edge of a half: the 60 cm depth. */
const DEPTH: readonly [number, number] = [42.3, -24.42];
/** Long edge of a half: the 120 cm width. */
const WIDTH: readonly [number, number] = [85.22, 49.2];
/** Top-left corner of the first half's surface. */
const ORIGIN: readonly [number, number] = [10, 46];
/** Apparent thickness of the tabletop. */
const THICKNESS = 4.6;
/** How far the legs drop below the surface. */
const LEG_LENGTH = 48;

type Point = [number, number];

function at(halfIndex: number, depth: number, width: number): Point {
  const along = halfIndex + width;
  return [
    ORIGIN[0] + DEPTH[0] * depth + WIDTH[0] * along,
    ORIGIN[1] + DEPTH[1] * depth + WIDTH[1] * along,
  ];
}

function polygon(points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function drop([x, y]: Point, distance: number): Point {
  return [x, y + distance];
}

/**
 * One leg, dropped from a corner of the surface.
 *
 * Legs belong to the table, not to each half: drawn per half they landed on
 * every half's right-hand corners, which on a full table put two at the far end
 * and two at the seam, leaving the near end apparently unsupported.
 */
function Leg({ foot, muted }: { foot: Point; muted: boolean }) {
  return (
    <line
      x1={foot[0]}
      y1={foot[1] + THICKNESS}
      x2={foot[0]}
      y2={foot[1] + THICKNESS + LEG_LENGTH}
      stroke={muted ? "var(--table-muted-edge)" : "var(--table-leg)"}
      strokeWidth={3.4}
      strokeLinecap="round"
    />
  );
}

type HalfProps = {
  index: number;
  muted: boolean;
  /** Draws the seam where two halves meet, so a full table reads as two stands. */
  seam: boolean;
  /** Renders this half as the participant's current selection. */
  selected: boolean;
};

function Half({ index, muted, seam, selected }: HalfProps) {
  const backLeft = at(index, 0, 0);
  const backRight = at(index, 0, 1);
  const frontLeft = at(index, 1, 0);
  const frontRight = at(index, 1, 1);

  const surface = muted
    ? "url(#full-table-hatch)"
    : selected
      ? "var(--table-surface-selected)"
      : "var(--table-surface)";
  const edge = muted ? "var(--table-muted-edge)" : "var(--table-edge)";

  return (
    <g>
      <polygon
        points={polygon([backLeft, backRight, frontRight, frontLeft])}
        fill={surface}
        stroke="var(--table-outline)"
        strokeWidth={muted ? 1.2 : selected ? 2.2 : 0.8}
        strokeDasharray={muted ? "4 3" : undefined}
      />
      {/* Front-left and front-right faces give the top its thickness. */}
      <polygon
        points={polygon([
          frontLeft,
          frontRight,
          drop(frontRight, THICKNESS),
          drop(frontLeft, THICKNESS),
        ])}
        fill={edge}
      />
      <polygon
        points={polygon([
          frontRight,
          backRight,
          drop(backRight, THICKNESS),
          drop(frontRight, THICKNESS),
        ])}
        fill={edge}
      />
      {seam ? (
        <line
          x1={backLeft[0]}
          y1={backLeft[1]}
          x2={frontLeft[0]}
          y2={frontLeft[1]}
          stroke="var(--table-outline)"
          strokeWidth={1.4}
          strokeDasharray="5 3"
        />
      ) : null}
    </g>
  );
}

export type FullTableGraphicVariant =
  /** One stand on its own. */
  | "half"
  /** Both halves of a declared pair, available. */
  | "full"
  /** The selected half is available; its companion is not. */
  | "companion-unavailable"
  /**
   * One stand highlighted beside a muted neighbour that is not part of it.
   *
   * The same drawing as `companion-unavailable` and a different fact: there is
   * no companion here, so nothing is occupied. It exists because a lone half
   * at thumbnail size reads as a whole table — the muted neighbour is what
   * makes "only this one" obvious.
   */
  | "half-highlighted"
  /** Both halves, shown as the current selection. */
  | "full-selected";

const DESCRIPTIONS: Record<FullTableGraphicVariant, string> = {
  half: "Un stand: media mesa, de 120 por 60 centímetros.",
  full: "Mesa completa: dos stands unidos, 240 por 60 centímetros.",
  "companion-unavailable":
    "Mesa con un solo stand disponible: el stand contiguo está ocupado.",
  "half-highlighted":
    "Un solo stand resaltado; el espacio contiguo no forma parte de él.",
  "full-selected":
    "Mesa completa seleccionada: dos stands unidos, con la división visible al medio.",
};

export default function FullTableGraphic({
  variant,
  className,
}: {
  variant: FullTableGraphicVariant;
  className?: string;
}) {
  const halves = variant === "half" ? 1 : 2;
  // Widened deliberately: which half is muted is a property of the variant, and
  // the legs ask about both ends rather than assuming only the far one can be.
  const mutedIndex: number | null =
    variant === "companion-unavailable" || variant === "half-highlighted"
      ? 1
      : null;
  const seam = variant === "full" || variant === "full-selected";

  // The viewBox grows with the number of halves so a full table is drawn twice
  // as long rather than squeezed into the same footprint.
  const width = ORIGIN[0] + DEPTH[0] + WIDTH[0] * halves + 12;
  const height =
    ORIGIN[1] + DEPTH[1] + WIDTH[1] * halves + THICKNESS + LEG_LENGTH + 12;

  return (
    <svg
      viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
      className={className}
      role="img"
      aria-label={DESCRIPTIONS[variant]}
      style={
        {
          "--table-surface": "#e6d1ff",
          "--table-surface-selected": "#c9a3ff",
          "--table-edge": "#a850ff",
          "--table-leg": "#6540cc",
          "--table-outline": "#6540cc",
          "--table-muted-edge": "#948f8f",
          maxWidth: "100%",
          height: "auto",
        } as CSSProperties
      }
    >
      <title>{DESCRIPTIONS[variant]}</title>
      <defs>
        {/* Non-colour cue for the unavailable half. */}
        <pattern
          id="full-table-hatch"
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="7" fill="#f1f0f0" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="#948f8f" strokeWidth="2" />
        </pattern>
      </defs>
      {/* Back legs first so the surface hides the part that runs behind it,
          front legs after so they stand in front of it. */}
      <Leg foot={at(0, 0, 0)} muted={mutedIndex === 0} />
      <Leg foot={at(halves - 1, 0, 1)} muted={mutedIndex === halves - 1} />
      {Array.from({ length: halves }, (_, index) => (
        <Half
          key={index}
          index={index}
          muted={mutedIndex === index}
          seam={seam && index === 1}
          // In the fallback state only the half actually being booked is
          // highlighted; its companion is the muted one.
          selected={
            variant === "full-selected" ||
            ((variant === "companion-unavailable" ||
              variant === "half-highlighted") &&
              index === 0)
          }
        />
      ))}
      <Leg foot={at(0, 1, 0)} muted={mutedIndex === 0} />
      <Leg foot={at(halves - 1, 1, 1)} muted={mutedIndex === halves - 1} />
    </svg>
  );
}
