"use client";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { Undo2Icon, UserIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const cardContent = {
  individual: {
    title: "Registro individual",
    description: "Vengo por mi cuenta o con amigos",
    icon: UserIcon,
  },
  family: {
    title: "Registro familiar",
    description: "Vengo con mi familia",
    icon: UsersIcon,
  },
};

function TypeCard({
  className,
  type,
  selected,
  festivalId,
  ...props
}: {
  festivalId: number;
  type: "individual" | "family";
  selected: boolean;
} & JSX.IntrinsicElements["div"]) {
  const content = cardContent[type];
  const Icon = content.icon;

  return (
    <div
      className={cn(
        `w-80 h-32 rounded-md flex p-4 border items-center justify-between shadow-md transition-all duration-300 cursor-pointer ${
          selected
            ? "transition-[width] duration-300 w-full bg-primary-100/30 border-primary-500 text-primary-500 h-20"
            : "hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500"
        }`,
        className,
      )}
      onClick={selected ? () => {} : props.onClick}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-8 h-8 text-primary-500" />
        <div>
          <h1 className="">{content.title}</h1>
          <span className="text-sm text-muted-foreground">
            {content.description}
          </span>
        </div>
      </div>
      {selected && (
        <Link
          className="p-2 border border-primary-200 rounded-md hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500"
          href={`/festivals/${festivalId}/event_day_registration`}
        >
          <Undo2Icon className="w-5 h-5" />
        </Link>
      )}
    </div>
  );
}

export default function RegistrationTypeCards({
  selectedType,
  festivalId,
}: {
  selectedType: "individual" | "family" | undefined;
  festivalId: number;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap justify-center gap-4 relative">
      <TypeCard
        className={
          selectedType !== "individual" && selectedType ? "hidden" : ""
        }
        festivalId={festivalId}
        selected={selectedType === "individual"}
        type="individual"
        onClick={() =>
          router.push(`?${new URLSearchParams({ type: "individual" })}`)
        }
      />
      <TypeCard
        className={selectedType !== "family" && selectedType ? "hidden" : ""}
        festivalId={festivalId}
        selected={selectedType === "family"}
        type="family"
        onClick={() =>
          router.push(`?${new URLSearchParams({ type: "family" })}`)
        }
      />
    </div>
  );
}
