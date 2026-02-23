"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import CategoryBadge from "@/app/components/category-badge";

type PublicMapTooltipProps = {
	stand: StandWithReservationsWithParticipants;
	anchorRect: DOMRect;
};

const GAP = 8;

function getParticipants(stand: StandWithReservationsWithParticipants) {
	return (
		stand.reservations
			?.filter((r) => r.status !== "rejected")
			.flatMap((r) => r.participants) ?? []
	);
}

export default function PublicMapTooltip({
	stand,
	anchorRect,
}: PublicMapTooltipProps) {
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number }>({
		top: 0,
		left: 0,
	});

	const participants = getParticipants(stand);
	const standLabel = `${stand.label}${stand.standNumber}`;
	const countLabel =
		participants.length === 1
			? "1 participante"
			: `${participants.length} participantes`;

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
			className="fixed z-50 rounded-xl border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 min-w-[180px]"
			style={{
				top: pos.top,
				left: pos.left,
				pointerEvents: "none",
			}}
		>
			<div className="p-3">
				<div className="flex items-center gap-2 mb-2">
					<Badge className="font-bold rounded-full text-xs px-2 py-0.5">
						{standLabel}
					</Badge>
					<span className="text-xs text-muted-foreground">{countLabel}</span>
				</div>
				{participants.length > 0 && (
					<div className="space-y-2">
						{participants.map((p, i) => (
							<div key={i} className="flex items-center gap-2">
								<Avatar className="w-8 h-8 shrink-0">
									<AvatarImage
										src={p.user.imageUrl ?? undefined}
										alt={p.user.displayName ?? "Participante"}
									/>
								</Avatar>
								<div>
									<p className="text-sm font-semibold leading-tight">
										{p.user.displayName ?? "Participante"}
									</p>
									<CategoryBadge
										category={p.user.category}
										className="text-[10px]"
									/>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);

	if (typeof document === "undefined") return null;

	return createPortal(tooltip, document.body);
}
