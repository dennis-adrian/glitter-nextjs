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
  loadingComponent?: React.ReactNode;
} & VariantProps<typeof buttonVariants>;

export default function SubmitButton(props: SubmitButtonProps) {
  const loadingComponent = props.loadingComponent || (
    <span className="flex gap-2 items-center">
      <Loader2Icon className="w-4 h-4 animate-spin" />
      {props.loadingLabel || "Cargando"}
    </span>
  );

  return (
    <Button
      variant={props.variant}
      disabled={props.disabled}
      type="submit"
      className={cn("w-full", props.className)}
    >
      {props.loading ? loadingComponent : props.children}
    </Button>
  );
}
