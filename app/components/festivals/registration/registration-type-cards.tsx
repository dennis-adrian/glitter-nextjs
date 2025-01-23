import { UserIcon, UsersIcon } from "lucide-react";
import { RegistrationType } from "./types";

export const registrationTypeDescription = {
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
  type,
  onClick,
}: {
  type: Exclude<RegistrationType, null>;
  onClick: () => void;
}) {
  const content = registrationTypeDescription[type];
  const Icon = content.icon;

  return (
    <div
      className="w-80 rounded-md flex border items-center justify-between shadow-md px-4 py-6 hover:bg-primary-100/30 hover:text-primary-500 hover:border-primary-500 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-4 text-center flex-col">
        <Icon className="w-12 h-12 hover:text-primary-500" />
        <div>
          <h1 className="h3 font-medium">{content.title}</h1>
          <span className="text-muted-foreground leading-3">
            {content.description}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RegistrationTypeCards({
  onSelect,
}: {
  onSelect: (type: RegistrationType) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      <TypeCard type="individual" onClick={() => onSelect("individual")} />
      <TypeCard type="family" onClick={() => onSelect("family")} />
    </div>
  );
}
