"use client";

import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import {
  adminAdjustOrder,
  type AdminAdjustOrderInput,
} from "@/app/lib/orders/actions";
import type {
  AdminOrderAdjustmentProduct,
  OrderWithRelations,
} from "@/app/lib/orders/definitions";
import { getOrderItemDisplayName } from "@/app/lib/orders/utils";

type DraftAddition = {
  key: string;
  productId: number;
  productVariantId: number | null;
  name: string;
  variantLabel: string | null;
  price: number;
  stock: number;
  quantity: number;
};

export default function AdminAdjustOrderForm({
  order,
  products,
}: {
  order: OrderWithRelations;
  products: AdminOrderAdjustmentProduct[];
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(
      order.orderItems.map((item) => [item.id, item.quantity]),
    ),
  );
  const [additions, setAdditions] = useState<DraftAddition[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<number, number | "">
  >({});
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return products.slice(0, 8);
    return products
      .filter(
        (product) =>
          product.name.toLocaleLowerCase("es").includes(query) ||
          product.variants.some((variant) =>
            variant.label.toLocaleLowerCase("es").includes(query),
          ),
      )
      .slice(0, 8);
  }, [products, search]);

  const existingTotal = order.orderItems.reduce(
    (sum, item) =>
      sum + item.priceAtPurchase * (quantities[item.id] ?? item.quantity),
    0,
  );
  const additionsTotal = additions.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const total = existingTotal + additionsTotal;
  const totalDelta = total - order.totalAmount;
  const isDirty =
    additions.length > 0 ||
    order.orderItems.some(
      (item) => (quantities[item.id] ?? item.quantity) !== item.quantity,
    );

  function addProduct(product: AdminOrderAdjustmentProduct) {
    const selectedVariantId = selectedVariants[product.id];
    const variant =
      selectedVariantId === "" || selectedVariantId == null
        ? null
        : (product.variants.find((item) => item.id === selectedVariantId) ??
          null);
    if (product.requiresVariant && !variant) {
      toast.error("Seleccioná una variante.");
      return;
    }
    const key = `${product.id}:${variant?.id ?? "base"}`;
    const stock = variant?.stock ?? product.stock;
    if (stock <= 0) {
      toast.error("Este producto no tiene stock disponible.");
      return;
    }
    setAdditions((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? { ...item, quantity: Math.min(item.quantity + 1, item.stock) }
            : item,
        );
      }
      return [
        ...current,
        {
          key,
          productId: product.id,
          productVariantId: variant?.id ?? null,
          name: product.name,
          variantLabel: variant?.label ?? null,
          price: variant?.price ?? product.price,
          stock,
          quantity: 1,
        },
      ];
    });
  }

  async function submit() {
    const payload: AdminAdjustOrderInput = {
      orderId: order.id,
      items: order.orderItems.map((item) => ({
        orderItemId: item.id,
        quantity: quantities[item.id] ?? item.quantity,
      })),
      additions: additions.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      })),
      expectedRevision: order.revision,
      reason,
      customerNote,
    };
    setPending(true);
    setConflict(false);
    try {
      const result = await adminAdjustOrder(payload);
      if (!result.success) {
        if (result.cause === "conflict") setConflict(true);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.push(`/dashboard/store/orders/${order.id}`);
    } catch {
      toast.error("No se pudo aplicar el ajuste.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {conflict && (
        <Alert variant="destructive">
          <AlertDescription>
            El pedido cambió en otra sesión. Recargá la página para continuar.
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={() => window.location.reload()}
            >
              Recargar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Artículos actuales</h2>
          <p className="text-sm text-muted-foreground">
            Las cantidades cambian mediante líneas de ajuste; el historial no se
            sobrescribe.
          </p>
        </div>
        {order.orderItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {getOrderItemDisplayName(item)}
              </p>
              <p className="text-sm text-muted-foreground">
                Bs {item.priceAtPurchase.toFixed(2)} c/u
                {item.adjustmentItemId != null ? " · agregado por ajuste" : ""}
              </p>
            </div>
            <Input
              aria-label={`Cantidad de ${getOrderItemDisplayName(item)}`}
              className="w-24 text-base"
              min={0}
              step={1}
              type="number"
              value={quantities[item.id] ?? item.quantity}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [item.id]: Math.max(
                    0,
                    Math.trunc(Number(event.target.value)) || 0,
                  ),
                }))
              }
            />
          </div>
        ))}
      </section>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Agregar producto</h2>
            <p className="text-sm text-muted-foreground">
              Precio y costo se guardarán con los valores vigentes al aplicar.
            </p>
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 text-base"
              placeholder="Buscar producto o variante"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            {filteredProducts.map((product) => {
              const selectedVariantId = selectedVariants[product.id];
              const selectedVariant = product.variants.find(
                (variant) => variant.id === selectedVariantId,
              );
              const stock = selectedVariant?.stock ?? product.stock;
              return (
                <div
                  key={product.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Bs {(selectedVariant?.price ?? product.price).toFixed(2)}{" "}
                      · stock {stock}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {product.requiresVariant && (
                      <select
                        aria-label={`Variante de ${product.name}`}
                        className="h-9 min-w-40 rounded-md border bg-background px-3 text-sm"
                        value={selectedVariantId ?? ""}
                        onChange={(event) =>
                          setSelectedVariants((current) => ({
                            ...current,
                            [product.id]: event.target.value
                              ? Number(event.target.value)
                              : "",
                          }))
                        }
                      >
                        <option value="">Seleccionar variante</option>
                        {product.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.label} · stock {variant.stock}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        (product.requiresVariant && !selectedVariant) ||
                        stock <= 0
                      }
                      onClick={() => addProduct(product)}
                    >
                      <PlusIcon className="mr-1 h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No se encontraron productos.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {additions.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Productos por agregar</h2>
          {additions.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {item.name}
                  {item.variantLabel ? ` (${item.variantLabel})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Bs {item.price.toFixed(2)} c/u · stock {item.stock}
                </p>
              </div>
              <Input
                aria-label={`Cantidad nueva de ${item.name}`}
                className="w-20 text-base"
                min={1}
                max={item.stock}
                step={1}
                type="number"
                value={item.quantity}
                onChange={(event) =>
                  setAdditions((current) =>
                    current.map((line) =>
                      line.key === item.key
                        ? {
                            ...line,
                            quantity: Math.min(
                              line.stock,
                              Math.max(
                                1,
                                Math.trunc(Number(event.target.value)) || 1,
                              ),
                            ),
                          }
                        : line,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Quitar ${item.name}`}
                onClick={() =>
                  setAdditions((current) =>
                    current.filter((line) => line.key !== item.key),
                  )
                }
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-3">
        <Summary label="Total anterior" value={order.totalAmount} />
        <Summary label="Cambio" value={totalDelta} signed />
        <Summary label="Nuevo total" value={total} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="adjust-reason">Motivo interno del ajuste</Label>
        <Textarea
          id="adjust-reason"
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo interno del ajuste"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="adjust-customer-note">
          Nota visible para cliente (opcional)
        </Label>
        <Textarea
          id="adjust-customer-note"
          maxLength={1000}
          value={customerNote}
          onChange={(event) => setCustomerNote(event.target.value)}
          placeholder="Nota visible para cliente (opcional)"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !reason.trim() || !isDirty}
        >
          {pending ? "Aplicando..." : "Aplicar ajuste"}
        </Button>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">
        {signed && value > 0 ? "+" : ""}Bs {value.toFixed(2)}
      </p>
    </div>
  );
}
