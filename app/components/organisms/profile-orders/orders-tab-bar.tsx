"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import OrdersSkeleton from "./orders-skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

const TABS = [
	{ value: "pending", label: "Pendientes" },
	{ value: "payment_verification", label: "En verificación" },
	{ value: "paid", label: "Pagados" },
	{ value: "delivered", label: "Entregados" },
	{ value: "cancelled", label: "Cancelados" },
] as const;

export type OrderTabValue = (typeof TABS)[number]["value"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersTabBar({
	activeTab,
	counts,
	children,
}: {
	activeTab: OrderTabValue;
	counts: Record<OrderTabValue, number>;
	children: React.ReactNode;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [optimisticTab, setOptimisticTab] = useOptimistic(activeTab);

	const handleTabChange = (tab: OrderTabValue) => {
		startTransition(() => {
			setOptimisticTab(tab);
			router.push(`/my_orders?tab=${tab}`);
		});
	};

	return (
		<>
			{/* Tab bar — dims while pending to block re-clicks */}
			<div
				className={`mt-4 flex gap-1 overflow-x-auto border-b no-scrollbar transition-opacity ${
					isPending ? "opacity-60 pointer-events-none" : ""
				}`}
			>
				{TABS.map((tab) => {
					const isActive = tab.value === optimisticTab;
					const count = counts[tab.value];
					return (
						<button
							key={tab.value}
							type="button"
							onClick={() => handleTabChange(tab.value)}
							className={`flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
							}`}
						>
							{tab.label}
							{count > 0 && (
								<span
									className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
										isActive
											? "bg-primary/10 text-primary"
											: "bg-gray-100 text-gray-600"
									}`}
								>
									{count}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{/* Orders area — skeleton appears instantly on tab click */}
			<div className="mt-4">{isPending ? <OrdersSkeleton /> : children}</div>
		</>
	);
}
