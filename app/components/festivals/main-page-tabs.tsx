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
    <Button
      className={cn("", {
        "bg-primary text-primary-foreground hover:bg-primary/80":
          props.selected,
      })}
      variant="ghost"
      onClick={props.onClick}
    >
      {props.children}
    </Button>
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
    <div className="flex pt-4 pb-2 border-b-2">
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
