import { registrationTypeDescription } from "@/app/components/festivals/registration/registration-type-cards";
import { RegistrationType } from "@/app/components/festivals/registration/types";
import { Button } from "@/app/components/ui/button";
import { Undo2Icon } from "lucide-react";

export default function RegistrationTypeBanner(props: {
  festivalId: number;
  type: RegistrationType;
  numberOfVisitors: number;
  onReset: () => void;
}) {
  if (!props.type) return null;

  const content = registrationTypeDescription[props.type];
  const Icon = content.icon;

  return (
    <div className="rounded-md flex border items-center justify-between shadow-md p-3 transition-[width] duration-300 w-full border-border">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" />
          <h1 className="h3 font-medium">{content.title}</h1>
        </div>
        {props.numberOfVisitors > 0 && (
          <span className="text-muted-foreground text-sm">
            ({props.numberOfVisitors} personas)
          </span>
        )}
      </div>
      <Button variant="outline" size="icon" onClick={props.onReset}>
        <Undo2Icon className="w-4 h-4" />
      </Button>
    </div>
  );
}
