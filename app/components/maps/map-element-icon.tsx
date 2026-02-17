import { MapElementType } from "@/app/lib/map_elements/definitions";

/**
 * Renders a simple SVG icon for a map element type.
 * Icons are drawn relative to a bounding box centered at (cx, cy) with the given size.
 * All paths are designed for SVG viewBox coordinates (small units).
 */
type MapElementIconProps = {
	type: MapElementType;
	cx: number;
	cy: number;
	size: number;
	color?: string;
};

export default function MapElementIcon({
	type,
	cx,
	cy,
	size,
	color = "#374151",
}: MapElementIconProps) {
	const half = size / 2;
	const x = cx - half;
	const y = cy - half;

	switch (type) {
		case "entrance":
			// Filled rounded arch with inward arrow
			return (
				<g style={{ pointerEvents: "none" }}>
					<rect
						x={x + size * 0.1}
						y={y + size * 0.08}
						width={size * 0.5}
						height={size * 0.84}
						rx={size * 0.12}
						fill={color}
						opacity={0.85}
					/>
					<polygon
						points={`${cx + size * 0.15},${cy - size * 0.18} ${cx + size * 0.45},${cy} ${cx + size * 0.15},${cy + size * 0.18}`}
						fill={color}
					/>
					<rect
						x={cx + size * 0.05}
						y={cy - size * 0.06}
						width={size * 0.25}
						height={size * 0.12}
						rx={size * 0.04}
						fill={color}
					/>
				</g>
			);

		case "stage":
			// Filled microphone silhouette
			return (
				<g style={{ pointerEvents: "none" }}>
					<rect
						x={cx - size * 0.13}
						y={y + size * 0.1}
						width={size * 0.26}
						height={size * 0.35}
						rx={size * 0.13}
						fill={color}
					/>
					<rect
						x={cx - size * 0.04}
						y={y + size * 0.45}
						width={size * 0.08}
						height={size * 0.25}
						rx={size * 0.03}
						fill={color}
					/>
					<rect
						x={cx - size * 0.18}
						y={y + size * 0.68}
						width={size * 0.36}
						height={size * 0.1}
						rx={size * 0.05}
						fill={color}
					/>
				</g>
			);

		case "door":
			// Filled double chevrons (bidirectional passage)
			return (
				<g style={{ pointerEvents: "none" }}>
					<polygon
						points={`${x + size * 0.05},${cy} ${x + size * 0.3},${cy - size * 0.25} ${x + size * 0.3},${cy + size * 0.25}`}
						fill={color}
					/>
					<polygon
						points={`${x + size * 0.95},${cy} ${x + size * 0.7},${cy - size * 0.25} ${x + size * 0.7},${cy + size * 0.25}`}
						fill={color}
					/>
					<rect
						x={x + size * 0.33}
						y={cy - size * 0.07}
						width={size * 0.34}
						height={size * 0.14}
						rx={size * 0.04}
						fill={color}
					/>
				</g>
			);

		case "bathroom":
			// Two filled person silhouettes (restroom style)
			return (
				<g style={{ pointerEvents: "none" }}>
					{/* Left figure */}
					<circle
						cx={cx - size * 0.18}
						cy={y + size * 0.18}
						r={size * 0.1}
						fill={color}
					/>
					<rect
						x={cx - size * 0.3}
						y={y + size * 0.32}
						width={size * 0.24}
						height={size * 0.3}
						rx={size * 0.08}
						fill={color}
					/>
					<rect
						x={cx - size * 0.28}
						y={y + size * 0.58}
						width={size * 0.08}
						height={size * 0.25}
						rx={size * 0.04}
						fill={color}
					/>
					<rect
						x={cx - size * 0.18}
						y={y + size * 0.58}
						width={size * 0.08}
						height={size * 0.25}
						rx={size * 0.04}
						fill={color}
					/>
					{/* Right figure */}
					<circle
						cx={cx + size * 0.18}
						cy={y + size * 0.18}
						r={size * 0.1}
						fill={color}
					/>
					<path
						d={`M${cx + size * 0.06},${y + size * 0.32} h${size * 0.24} q${size * 0.04},0 ${size * 0.04},${size * 0.04} l-${size * 0.04},${size * 0.26} h-${size * 0.02} v${size * 0.18} q0,${size * 0.03} -${size * 0.04},${size * 0.03} q-${size * 0.04},0 -${size * 0.04},-${size * 0.03} v-${size * 0.18} h-${size * 0.04} v${size * 0.18} q0,${size * 0.03} -${size * 0.04},${size * 0.03} q-${size * 0.04},0 -${size * 0.04},-${size * 0.03} v-${size * 0.18} h-${size * 0.02} l-${size * 0.04},-${size * 0.26} q0,-${size * 0.04} ${size * 0.04},-${size * 0.04} Z`}
						fill={color}
					/>
				</g>
			);

		case "label":
			// Bold filled "T" shape
			return (
				<g style={{ pointerEvents: "none" }}>
					<rect
						x={x + size * 0.15}
						y={y + size * 0.18}
						width={size * 0.7}
						height={size * 0.16}
						rx={size * 0.06}
						fill={color}
					/>
					<rect
						x={cx - size * 0.08}
						y={y + size * 0.18}
						width={size * 0.16}
						height={size * 0.65}
						rx={size * 0.06}
						fill={color}
					/>
				</g>
			);

		case "stairs":
			// Descending staircase steps with rounded corners
			return (
				<g style={{ pointerEvents: "none" }}>
					{[0, 1, 2, 3].map((step) => {
						const stepW = size * 0.2;
						const stepH = size * 0.15;
						const sx = x + size * 0.15 + step * stepW;
						const sy = y + size * 0.2 + step * stepH;
						return (
							<rect
								key={step}
								x={sx}
								y={sy}
								width={stepW}
								height={size * 0.8 - step * stepH}
								rx={size * 0.03}
								fill={color}
								opacity={0.9}
							/>
						);
					})}
				</g>
			);

		case "custom":
			// Filled star shape
			return (
				<g style={{ pointerEvents: "none" }}>
					<polygon
						points={starPoints(cx, cy, size * 0.4, size * 0.18, 5)}
						fill={color}
						opacity={0.85}
					/>
				</g>
			);

		default:
			return null;
	}
}

function starPoints(
	cx: number,
	cy: number,
	outerR: number,
	innerR: number,
	points: number,
): string {
	const result: string[] = [];
	for (let i = 0; i < points * 2; i++) {
		const angle = (Math.PI * i) / points - Math.PI / 2;
		const r = i % 2 === 0 ? outerR : innerR;
		result.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
	}
	return result.join(" ");
}
