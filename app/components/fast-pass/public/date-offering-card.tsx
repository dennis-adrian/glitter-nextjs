import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FAST_PASS_SALE_STATE_LABELS } from "@/app/lib/fast-pass/state";
import type { FastPassSaleState } from "@/app/lib/fast-pass/state";
import { formatFullDate } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";

export type FastPassPublicDateOffering = {
  festivalDateId: number;
  startDate: Date;
  price: number;
  saleState: FastPassSaleState;
  remainingPaid: number | null;
};

type Props = {
  festivalId: number;
  dates: FastPassPublicDateOffering[];
};

export default function FastPassDateOfferingCard({
  festivalId,
  dates,
}: Props) {
  if (dates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay días con Pase Rápido disponible.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {dates.map((date) => (
        <Card key={date.festivalDateId}>
          <CardHeader>
            <CardTitle>{formatFullDate(date.startDate)}</CardTitle>
            <CardDescription>
              {FAST_PASS_SALE_STATE_LABELS[date.saleState]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold">{formatMoney(date.price)}</p>
            {date.remainingPaid !== null ? (
              <p className="text-sm text-muted-foreground">
                {date.remainingPaid} pase(s) disponible(s)
              </p>
            ) : null}
            {date.saleState === "on_sale" && (date.remainingPaid ?? 1) > 0 ? (
              <Button asChild className="w-full">
                <Link
                  href={`/festivals/${festivalId}/fast-pass/${date.festivalDateId}`}
                >
                  Comprar Pase Rápido
                </Link>
              </Button>
            ) : (
              <Button disabled className="w-full">
                No disponible
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
