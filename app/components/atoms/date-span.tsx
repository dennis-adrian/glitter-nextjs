"use client";

import { DateTime, DateTimeFormatOptions } from "luxon";

export default function DateSpan({
	className,
	date,
	format = { month: "short", day: "numeric" },
}: {
	className?: string;
	date: Date;
	format?: DateTimeFormatOptions;
}) {
	return (
		<span className={className}>
			{DateTime.fromJSDate(new Date(date))
				.setLocale("es")
				.toLocaleString(format)}
		</span>
	);
}
