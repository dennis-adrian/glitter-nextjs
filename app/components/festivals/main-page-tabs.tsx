"use client";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { useRouter } from "next/navigation";

type TabItemProps = {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
};

function TabItem(props: TabItemProps) {
  return (
    <div
      className={cn(
        "p-2 text-sm cursor-default transition duration-500 ease-in-out hover:text-primary-400 hover:border-b",
        {
          "border-b-2 border-primary-400 text-primary-400": props.selected,
          "text-muted-foreground": !props.selected,
        },
      )}
      onClick={props.onClick}
    >
      {props.children}
    </div>
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
        Información general
      </TabItem>
      <TabItem
        selected={props.selectedTab === "sectors"}
        onClick={() => setSearchParams("sectors")}
      >
        Sectores y participantes
      </TabItem>
    </div>
  );
}
