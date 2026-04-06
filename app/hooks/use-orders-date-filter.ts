"use client";

import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";

export type DatePeriod = "all" | "today" | "week" | "month";

export function useOrdersDateFilter(orders: OrderWithRelations[]) {
	const [period, setPeriod] = useState<DatePeriod>("all");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [now, setNow] = useState(() => DateTime.now().setZone(STORE_TIMEZONE));

	const hasCustomRange = !!(dateFrom || dateTo);

	function selectPeriod(p: DatePeriod) {
		setPeriod(p);
		setDateFrom("");
		setDateTo("");
	}

	function handleFromChange(v: string) {
		setDateFrom(v);
		if (v) setPeriod("all");
	}

	function handleToChange(v: string) {
		setDateTo(v);
		if (v) setPeriod("all");
	}

	useEffect(() => {
		const refreshNow = () => {
			setNow(DateTime.now().setZone(STORE_TIMEZONE));
		};

		const intervalId = window.setInterval(refreshNow, 60 * 1000);
		window.addEventListener("focus", refreshNow);
		document.addEventListener("visibilitychange", refreshNow);

		return () => {
			window.clearInterval(intervalId);
			window.removeEventListener("focus", refreshNow);
			document.removeEventListener("visibilitychange", refreshNow);
		};
	}, []);

	const filteredByDate = useMemo(() => {
		if (hasCustomRange) {
			return orders.filter((o) => {
				const d = formatDate(o.createdAt);
				if (dateFrom) {
					const from = DateTime.fromISO(dateFrom, {
						zone: STORE_TIMEZONE,
					}).startOf("day");
					if (d < from) return false;
				}
				if (dateTo) {
					const to = DateTime.fromISO(dateTo, {
						zone: STORE_TIMEZONE,
					}).endOf("day");
					if (d > to) return false;
				}
				return true;
			});
		}

		if (period === "all") return orders;

		const cutoff =
			period === "today"
				? now.startOf("day")
				: period === "week"
					? now.startOf("week")
					: now.startOf("month");

		return orders.filter(
			(o) => formatDate(o.createdAt).toMillis() >= cutoff.toMillis(),
		);
	}, [orders, period, dateFrom, dateTo, hasCustomRange, now]);

	return {
		period,
		dateFrom,
		dateTo,
		hasCustomRange,
		filteredByDate,
		selectPeriod,
		handleFromChange,
		handleToChange,
	};
}
