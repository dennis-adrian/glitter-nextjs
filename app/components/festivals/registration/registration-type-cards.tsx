"use client";

import { useState } from "react";

import { UserIcon, UsersIcon } from "lucide-react";
import { cn } from "@/app/lib/utils";

const cardContent = {
  individual: {
    title: "Resgistro individual",
    description: "Vengo por mi cuenta o con amigos",
    icon: UserIcon,
  },
  family: {
    title: "Registro familiar",
    description: "Vengo con mi familia (hijos, padres)",
    icon: UsersIcon,
  },
};

function TypeCard({
  className,
  type,
  selected,
  ...props
}: {
  type: "individual" | "family";
  selected: boolean;
} & JSX.IntrinsicElements["div"]) {
  const content = cardContent[type];
  const Icon = content.icon;

  return (
    <div
      // className="w-80 h-24 rounded-md flex gap-2 p-4 border items-center hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500 shadow-md transition-all duration-300"
      className={cn(
        `w-80 h-32 rounded-md flex gap-2 p-4 border items-center shadow-md transition-all duration-300 cursor-pointer ${
          selected
            ? "transition-[width] duration-300 w-full bg-primary-100/30 border-primary-500 text-primary-500 h-20"
            : "hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500"
        }`,
        className,
      )}
      onClick={props.onClick}
    >
      <Icon className="w-8 h-8 text-primary-500" />
      <div>
        <h1 className="">{content.title}</h1>
        <span className="text-sm text-muted-foreground">
          {content.description}
        </span>
      </div>
    </div>
  );
}

export default function RegistrationTypeCards() {
  const [selectedType, setSelectedType] = useState<
    "individual" | "family" | null
  >(null);

  return (
    <div className="flex flex-wrap justify-center gap-4 relative">
      <TypeCard
        className={
          selectedType !== "individual" && selectedType ? "hidden" : ""
        }
        selected={selectedType === "individual"}
        type="individual"
        onClick={() => setSelectedType("individual")}
      />
      <TypeCard
        className={selectedType !== "family" && selectedType ? "hidden" : ""}
        selected={selectedType === "family"}
        type="family"
        onClick={() => setSelectedType("family")}
      />
    </div>
  );
}
