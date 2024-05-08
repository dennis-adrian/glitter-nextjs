import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { Loader2Icon } from "lucide-react";

type SubmitButtonProps = {
  className?: string;
  disabled: boolean;
  label: string;
  loading: boolean;
  loadingLabel?: string;
};

export default function SubmitButton(props: SubmitButtonProps) {
  return (
    <Button
      disabled={props.disabled}
      type="submit"
      className={cn("w-full", props.className)}
    >
      {props.disabled ? (
        <span className="flex gap-2 items-center">
          <Loader2Icon className="w-4 h-4 animate-spin" />
          {props.loadingLabel || "Cargando"}
        </span>
      ) : (
        <span>{props.label}</span>
      )}
    </Button>
  );
}
