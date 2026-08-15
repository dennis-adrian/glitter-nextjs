import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { FastPassInventoryOverviewDate } from "@/app/lib/fast-pass/inventory-queries";
import { FAST_PASS_SALE_STATE_LABELS } from "@/app/lib/fast-pass/state";
import { formatFullDate } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";

type Props = {
  date: FastPassInventoryOverviewDate;
};

export default function FastPassOverviewDateCard({ date }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{formatFullDate(date.startDate)}</CardTitle>
            <CardDescription>
              {date.offeringEnabled
                ? "Oferta habilitada"
                : "Oferta deshabilitada"}
            </CardDescription>
          </div>
          <Badge
            variant={date.saleState === "on_sale" ? "default" : "secondary"}
          >
            {FAST_PASS_SALE_STATE_LABELS[date.saleState]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">Precio por pase</p>
          <p className="font-semibold">{formatMoney(date.price)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            Pases pagos disponibles
          </p>
          <p className="font-semibold">
            {date.remainingPaid} / {date.paidInventoryLimit}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            Capacidad prioritaria disponible
          </p>
          <p className="font-semibold">
            {date.remainingPriority} / {date.priorityCapacityLimit}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
