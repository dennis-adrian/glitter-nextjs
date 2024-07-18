"use client";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import clsx from "clsx";
import { Undo2Icon, UserIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const cardContent = {
  individual: {
    title: "Registro personal",
    description: "Conozco y puedo llenar mis datos personales",
    icon: UserIcon,
  },
  family: {
    title: "Registro familiar",
    description: "Vengo acompañado de familiares a mi cargo",
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
        `w-80 rounded-md flex border items-center justify-between shadow-md transition-all duration-300 ${
          selected
            ? "p-3 transition-[width] duration-300 w-full border-border"
            : "px-4 py-6 hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500 cursor-pointer"
        }`,
        className,
      )}
      onClick={selected ? () => {} : props.onClick}
    >
      <div
        className={clsx("flex items-center gap-4 text-center", {
          "flex-col": !selected,
          "flex-row": selected,
        })}
      >
        <Icon
          className={!selected ? "w-12 h-12 hover:text-primary-500" : "w-5 h-5"}
        />
        <div>
          <h1 className="h3 font-medium">{content.title}</h1>
          <span className="text-muted-foreground leading-3">
            {!selected && content.description}
          </span>
        </div>
      </div>
      {selected && (
        <Link
          className="p-2 border border-primary-200 rounded-md hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500"
          href={`/festivals/${festivalId}/event_day_registration`}
        >
          <Undo2Icon className="w-4 h-4" />
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
