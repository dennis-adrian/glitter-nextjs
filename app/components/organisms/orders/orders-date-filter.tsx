"use client";

import { Input } from "@/app/components/ui/input";
import { type DatePeriod } from "@/app/hooks/use-orders-date-filter";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

const PERIOD_OPTIONS: { value: DatePeriod; label: string }[] = [
	{ value: "all", label: "Todo" },
	{ value: "today", label: "Hoy" },
	{ value: "week", label: "Esta semana" },
	{ value: "month", label: "Este mes" },
];

type OrdersDateFilterProps = {
	period: DatePeriod;
	dateFrom: string;
	dateTo: string;
	hasCustomRange: boolean;
	onPeriodChange: (p: DatePeriod) => void;
	onFromChange: (v: string) => void;
	onToChange: (v: string) => void;
};

export default function OrdersDateFilter({
	period,
	dateFrom,
	dateTo,
	hasCustomRange,
	onPeriodChange,
	onFromChange,
	onToChange,
}: OrdersDateFilterProps) {
	const [customOpen, setCustomOpen] = useState(false);

	function handlePeriodClick(p: DatePeriod) {
		setCustomOpen(false);
		onPeriodChange(p);
	}

	function handleCustomClick() {
		setCustomOpen(true);
		onPeriodChange("all");
	}

	function handleClearCustom() {
		setCustomOpen(false);
		onPeriodChange("all");
	}

	const showInputs = customOpen || hasCustomRange;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-1.5 flex-wrap items-center">
				{PERIOD_OPTIONS.map((opt) => {
					const isActive =
						!customOpen && !hasCustomRange && period === opt.value;
					return (
						<button
							key={opt.value}
							onClick={() => handlePeriodClick(opt.value)}
							className={cn(
								"rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
								isActive
									? "bg-secondary text-secondary-foreground border-secondary"
									: "border-border text-muted-foreground hover:bg-accent",
							)}
						>
							{opt.label}
						</button>
					);
				})}

				{!showInputs ? (
					<button
						onClick={handleCustomClick}
						className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
					>
						<CalendarIcon className="h-3 w-3" />
						Personalizado
					</button>
				) : (
					<button
						onClick={handleClearCustom}
						className={cn(
							"inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
							hasCustomRange
								? "border-secondary bg-secondary text-secondary-foreground"
								: "border-border text-muted-foreground hover:bg-accent",
						)}
					>
						<CalendarIcon className="h-3 w-3" />
						Personalizado ✕
					</button>
				)}
			</div>

			{showInputs && (
				<div className="flex items-center gap-2">
					<Input
						type="date"
						value={dateFrom}
						max={dateTo || undefined}
						onChange={(e) => onFromChange(e.target.value)}
						className="h-8 text-xs"
						aria-label="Desde"
					/>
					<span className="text-xs text-muted-foreground shrink-0">—</span>
					<Input
						type="date"
						value={dateTo}
						min={dateFrom || undefined}
						onChange={(e) => onToChange(e.target.value)}
						className="h-8 text-xs"
						aria-label="Hasta"
					/>
				</div>
			)}
		</div>
	);
}
