"use client";

import { cn } from "@/app/lib/utils";
import { useRouter } from "next/navigation";

type TabItemProps = {
	children: React.ReactNode;
	selected: boolean;
	onClick: () => void;
};

function TabItem(props: TabItemProps) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={props.selected}
			className={cn(
				"p-2 text-sm transition duration-500 ease-in-out hover:text-primary-400 hover:border-b",
				{
					"border-b-2 border-primary-400 text-primary-400": props.selected,
					"text-muted-foreground": !props.selected,
				},
			)}
			onClick={props.onClick}
		>
			{props.children}
		</button>
	);
}

type FestivalPageTabsProps = {
	selectedTab: string;
};

export default function FestivalPageTabs(props: FestivalPageTabsProps) {
	const router = useRouter();

	function setSearchParams(params: string) {
		router.push(`?${new URLSearchParams({ tab: params })}`);
	}

	return (
		<div className="flex pt-4 border-b">
			<TabItem
				selected={props.selectedTab === "general"}
				onClick={() => setSearchParams("general")}
			>
				Info.
			</TabItem>
			<TabItem
				selected={props.selectedTab === "sectors"}
				onClick={() => setSearchParams("sectors")}
			>
				Participantes
			</TabItem>
			<TabItem
				selected={props.selectedTab === "activities"}
				onClick={() => setSearchParams("activities")}
			>
				Actividades
			</TabItem>
		</div>
	);
}
