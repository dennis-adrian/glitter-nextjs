"use server";

import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { fetchCurrentRentals } from "@/app/lib/rentals/return-actions";
import {
  deriveRentalStatus,
  getRentalStatusLabel,
} from "@/app/lib/rentals/status";
import { formatDate } from "@/app/lib/formatters";

export default async function CurrentRentalsPage() {
  const rentals = await fetchCurrentRentals();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Alquileres activos</h1>
        <p className="text-sm text-muted-foreground">
          Productos actualmente en alquiler según pedidos abiertos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rentals.length} línea(s) con unidades pendientes de devolución
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rentals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay alquileres activos en este momento.
            </p>
          ) : (
            rentals.map((rental) => {
              const status = deriveRentalStatus({
                transactionType: "rental",
                quantity: rental.quantity,
                rentalReturnedQuantity: rental.rentalReturnedQuantity,
              });

              return (
                <div
                  key={rental.orderItemId}
                  className="grid gap-2 rounded-lg border p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
                >
                  <div>
                    <p className="font-medium">{rental.productName}</p>
                    {rental.productVariantLabel && (
                      <p className="text-sm text-muted-foreground">
                        {rental.productVariantLabel}
                      </p>
                    )}
                  </div>
                  <div className="text-sm">
                    <p>{rental.quantityOut} en alquiler</p>
                    <Badge variant="outline">
                      {getRentalStatusLabel(status)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      Cliente:{" "}
                      {rental.orderGuestName ??
                        (rental.orderUserId != null
                          ? `Usuario #${rental.orderUserId}`
                          : "Usuario desconocido")}
                    </p>
                    <p>
                      {formatDate(rental.rentedAt).toLocaleString({
                        dateStyle: "medium",
                      })}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/store/orders/${rental.orderId}`}
                    className="self-center text-sm font-medium text-primary hover:underline"
                  >
                    Ver pedido
                  </Link>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
