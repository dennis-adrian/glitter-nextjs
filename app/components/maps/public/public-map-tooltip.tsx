"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

type PublicMapTooltipProps = {
	stand: StandWithReservationsWithParticipants;
	anchorRect: DOMRect;
};

const GAP = 8;

function getParticipantNames(
	stand: StandWithReservationsWithParticipants,
): string[] {
	return stand.reservations
		?.filter((r) => r.status !== "rejected")
		.flatMap((r) =>
			r.participants.map(
				(p) => p.user.displayName || "Participante",
			),
		) ?? [];
}

export default function PublicMapTooltip({
	stand,
	anchorRect,
}: PublicMapTooltipProps) {
	const { label, standNumber, status } = stand;
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number }>({
		top: 0,
		left: 0,
	});

	const isOccupied = status === "reserved" || status === "confirmed";
	const participantNames = isOccupied ? getParticipantNames(stand) : [];

	const recomputePosition = useCallback(() => {
		const el = tooltipRef.current;
		if (!el) return;

		const { width, height } = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let left = anchorRect.right + GAP;
		if (left + width > vw) {
			left = anchorRect.left - GAP - width;
		}
		left = Math.max(GAP, Math.min(left, vw - width - GAP));

		let top = anchorRect.top + anchorRect.height / 2 - height / 2;
		top = Math.max(GAP, Math.min(top, vh - height - GAP));

		setPos({ top, left });
	}, [anchorRect]);

	useLayoutEffect(() => {
		recomputePosition();
	}, [recomputePosition]);

	useEffect(() => {
		const el = tooltipRef.current;
		if (!el) return;

		window.addEventListener("resize", recomputePosition);
		const resizeObserver = new ResizeObserver(recomputePosition);
		resizeObserver.observe(el);

		return () => {
			window.removeEventListener("resize", recomputePosition);
			resizeObserver.disconnect();
		};
	}, [recomputePosition]);

	const tooltip = (
		<div
			ref={tooltipRef}
			className="fixed z-50 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
			style={{
				top: pos.top,
				left: pos.left,
				pointerEvents: "none",
			}}
		>
			<p className="text-sm font-semibold">
				Espacio {label}
				{standNumber}
			</p>
			<p className="text-xs text-muted-foreground">
				{isOccupied ? "Ocupado" : "Disponible"}
			</p>
			{participantNames.length > 0 && (
				<p className="text-xs text-muted-foreground mt-1">
					{participantNames.join(", ")}
				</p>
			)}
		</div>
	);

	if (typeof document === "undefined") return null;

	return createPortal(tooltip, document.body);
}
