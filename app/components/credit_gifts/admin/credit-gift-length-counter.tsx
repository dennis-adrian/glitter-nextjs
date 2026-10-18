/** "92/300" next to a capped field. */
export default function CreditGiftLengthCounter({
  length,
  max,
}: {
  length: number;
  max: number;
}) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {length}/{max}
    </span>
  );
}
