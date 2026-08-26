import { cn } from "@/app/lib/utils";

type CountLabelProps = {
  count: number;
  singular: string;
  plural: string;
  className?: string;
};

export default function CountLabel({
  count,
  singular,
  plural,
  className,
}: CountLabelProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {count} {count === 1 ? singular : plural}
    </span>
  );
}
