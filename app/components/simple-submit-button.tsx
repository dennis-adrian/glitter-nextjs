import { Button, buttonVariants } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";

type SubmitButtonProps = {
  className?: string;
  children?: React.ReactNode;
  disabled: boolean;
  label?: string;
  loading: boolean;
  loadingLabel?: string;
} & VariantProps<typeof buttonVariants>;

export default function SubmitButton(props: SubmitButtonProps) {
  return (
    <Button
      variant={props.variant}
      disabled={props.disabled}
      type="submit"
      className={cn("w-full", props.className)}
    >
      {props.loading ? (
        <span className="flex gap-2 items-center">
          <Loader2Icon className="w-4 h-4 animate-spin" />
          {props.loadingLabel || "Cargando"}
        </span>
      ) : props.children ? (
        props.children
      ) : (
        <span>{props.label}</span>
      )}
    </Button>
  );
}
