"use client";

import { useCallback, useEffect, useRef } from "react";

type StandStatusUpdate = { id: number; status: string };

export function useStandPolling(
	sectorId: number | null,
	intervalMs: number = 4000,
	onUpdate: (stands: StandStatusUpdate[]) => void,
) {
	const onUpdateRef = useRef(onUpdate);
	useEffect(() => {
		onUpdateRef.current = onUpdate;
	}, [onUpdate]);

	const poll = useCallback(async () => {
		if (!sectorId) return;
		try {
			const res = await fetch(`/api/stands/status?sectorId=${sectorId}`);
			if (res.ok) {
				const data = await res.json();
				onUpdateRef.current(data.stands);
			}
		} catch (error) {
			console.error("Stand polling error", error);
		}
	}, [sectorId]);

	useEffect(() => {
		if (!sectorId) return;

		// Initial poll
		poll();

		let timer = setInterval(poll, intervalMs);

		const handleVisibilityChange = () => {
			if (document.hidden) {
				clearInterval(timer);
			} else {
				// Catch up immediately when tab becomes visible, then resume interval
				poll();
				timer = setInterval(poll, intervalMs);
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [sectorId, intervalMs, poll]);
}
