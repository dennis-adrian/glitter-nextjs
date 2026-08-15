"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { FAST_PASS_MAX_CHILDREN_PER_ADULT } from "@/app/lib/fast-pass/definitions";
import {
  createOnSiteSale,
  recoverOnSiteSale,
  type FastPassPosContext,
  type RecoveredOnSiteSale,
} from "@/app/lib/fast-pass/pos-actions";
import {
  clearPosIdempotencyKey,
  getPosIdempotencyKey,
  getServerPosIdempotencyKey,
  persistPosIdempotencyKey,
  subscribeToPosIdempotencyKey,
  withPosIdempotencyLock,
} from "@/app/lib/fast-pass/pos-idempotency-store";
import { formatMoney } from "@/app/lib/programs/pricing";
import { useUploadThing } from "@/app/vendors/uploadthing";

type PaymentMethod = "bank_qr" | "cash";

type HolderDraft = {
  firstName: string;
  lastName: string;
  responsibleChildCount: number;
};

type SaleSuccess = {
  purchaseId: number;
  total: number;
  paidCount: number;
  wristbandCount: number;
};

function recoveredSaleResult(sale: RecoveredOnSiteSale) {
  return {
    success: true as const,
    message: "Esta venta ya se registró",
    purchaseId: sale.purchaseId,
    total: sale.total,
    ticketsIssued: sale.paidCount,
    wristbandCount: sale.wristbandCount,
  };
}

type Props = {
  credential: string;
  context: FastPassPosContext;
};

function emptyHolder(): HolderDraft {
  return {
    firstName: "",
    lastName: "",
    responsibleChildCount: 0,
  };
}

function initialPaymentMethod(
  context: FastPassPosContext,
): PaymentMethod | null {
  if (context.onSiteBankQrEnabled) return "bank_qr";
  if (context.onSiteCashEnabled) return "cash";
  return null;
}

function createClientIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function FastPassPosSaleForm({ credential, context }: Props) {
  const router = useRouter();
  const idempotencyKeyRef = useRef<string | null>(null);
  const storageKey = `fast-pass-pos-pending-${context.settingsId}`;
  const { startUpload } = useUploadThing("fastPassPosVoucher");
  const soldOut = context.remainingPaid <= 0;
  const noPaymentMethod =
    !context.onSiteBankQrEnabled && !context.onSiteCashEnabled;
  const formBlocked = soldOut || noPaymentMethod;

  const [paidCount, setPaidCount] = useState(1);
  const [holders, setHolders] = useState<HolderDraft[]>([emptyHolder()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(() =>
    initialPaymentMethod(context),
  );
  const [cashReceived, setCashReceived] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [detailsEnabled, setDetailsEnabled] = useState(
    context.onSiteVisitorDetailsRequired,
  );
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<SaleSuccess | null>(null);
  const [recoveredSuccess, setRecoveredSuccess] = useState<{
    key: string;
    sale: SaleSuccess;
  } | null>(null);
  const subscribeToSavedKey = useCallback(
    (onStoreChange: () => void) =>
      subscribeToPosIdempotencyKey(storageKey, onStoreChange),
    [storageKey],
  );
  const getSavedKey = useCallback(
    () => getPosIdempotencyKey(storageKey),
    [storageKey],
  );
  const savedKey = useSyncExternalStore(
    subscribeToSavedKey,
    getSavedKey,
    getServerPosIdempotencyKey,
  );

  useEffect(() => {
    idempotencyKeyRef.current = savedKey;
    if (!savedKey) {
      return;
    }

    let cancelled = false;
    void withPosIdempotencyLock(storageKey, async () => {
      if (getPosIdempotencyKey(storageKey) !== savedKey) return;

      const recovered = await recoverOnSiteSale({
        settingsId: context.settingsId,
        posCredential: credential,
        idempotencyKey: savedKey,
      });
      if (cancelled) return;

      if (recovered.status === "found") {
        setRecoveredSuccess({ key: savedKey, sale: recovered.sale });
        return;
      }

      if (recovered.status === "absent") {
        clearPosIdempotencyKey(storageKey, savedKey);
        idempotencyKeyRef.current = null;
      }
    }).catch((error) => {
      if (!cancelled) {
        console.error("FastPass POS idempotency lock failed", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [context.settingsId, credential, savedKey, storageKey]);

  const visibleRecoveredSuccess =
    recoveredSuccess?.key === savedKey ? recoveredSuccess.sale : null;
  const visibleSuccess = lastSuccess ?? visibleRecoveredSuccess;

  const totalAmount = paidCount * context.price;
  const totalPriority =
    paidCount +
    holders
      .slice(0, paidCount)
      .reduce((sum, holder) => sum + holder.responsibleChildCount, 0);

  function updatePaidCount(next: number) {
    if (context.remainingPaid <= 0) return;
    const clamped = Math.max(1, Math.min(next, context.remainingPaid));
    setPaidCount(clamped);
    setHolders((current) => {
      const copy = [...current];
      while (copy.length < clamped) copy.push(emptyHolder());
      return copy.slice(0, clamped);
    });
  }

  function updateHolder(index: number, patch: Partial<HolderDraft>) {
    setHolders((current) => {
      const copy = [...current];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (formBlocked || !paymentMethod) return;

    if (totalPriority > context.remainingPriority) {
      toast.error("No hay capacidad prioritaria suficiente");
      return;
    }

    if (detailsEnabled) {
      for (let index = 0; index < paidCount; index += 1) {
        const holder = holders[index];
        if (!holder?.firstName.trim() || !holder.lastName.trim()) {
          toast.error("Completa el nombre de cada titular");
          return;
        }
      }
    }
    if (
      context.onSiteVisitorDetailsRequired &&
      !buyerEmail.trim() &&
      !buyerPhone.trim()
    ) {
      toast.error("Indica un correo o teléfono de contacto");
      return;
    }
    if (
      paymentMethod === "bank_qr" &&
      context.onSiteProofRequired &&
      !voucherFile
    ) {
      toast.error("Adjunta el comprobante de pago");
      return;
    }

    setPending(true);
    setLastSuccess(null);
    try {
      const payloadHolders = Array.from({ length: paidCount }, (_, index) => {
        const holder = holders[index] ?? emptyHolder();
        const base = {
          responsibleChildCount: holder.responsibleChildCount,
        };

        if (!detailsEnabled) {
          return base;
        }

        return {
          ...base,
          firstName: holder.firstName.trim(),
          lastName: holder.lastName.trim(),
        };
      });

      let voucher:
        | { voucherFileUrl: string; voucherFileKey: string }
        | undefined;
      if (paymentMethod === "bank_qr" && voucherFile) {
        const uploaded = await startUpload([voucherFile], {
          settingsId: context.settingsId,
          credential,
        });
        const results = uploaded?.[0]?.serverData?.results;
        if (!results?.imageUrl || !results.fileKey) {
          toast.error("No pudimos subir el comprobante");
          return;
        }
        voucher = {
          voucherFileUrl: results.imageUrl,
          voucherFileKey: results.fileKey,
        };
      }

      const result = await withPosIdempotencyLock(storageKey, async () => {
        let key = getPosIdempotencyKey(storageKey);
        if (key) {
          const recovered = await recoverOnSiteSale({
            settingsId: context.settingsId,
            posCredential: credential,
            idempotencyKey: key,
          });
          if (recovered.status === "found") {
            idempotencyKeyRef.current = key;
            return recoveredSaleResult(recovered.sale);
          }
          if (recovered.status === "unknown") {
            throw new Error("No pudimos verificar la venta pendiente");
          }
          clearPosIdempotencyKey(storageKey, key);
          idempotencyKeyRef.current = null;
        }

        key = createClientIdempotencyKey();
        persistPosIdempotencyKey(storageKey, key);
        idempotencyKeyRef.current = key;

        let created: Awaited<ReturnType<typeof createOnSiteSale>>;
        try {
          created = await createOnSiteSale({
            settingsId: context.settingsId,
            posCredential: credential,
            holders: payloadHolders,
            paymentMethod,
            idempotencyKey: key,
            buyerEmail: buyerEmail.trim() || undefined,
            buyerPhone: buyerPhone.trim() || undefined,
            ...voucher,
            cashReceivedAmount:
              paymentMethod === "cash" && cashReceived
                ? parseFloat(cashReceived)
                : undefined,
          });
        } catch (error) {
          const recovered = await recoverOnSiteSale({
            settingsId: context.settingsId,
            posCredential: credential,
            idempotencyKey: key,
          });
          if (recovered.status === "found") {
            return recoveredSaleResult(recovered.sale);
          }
          if (recovered.status === "absent") {
            clearPosIdempotencyKey(storageKey, key);
            idempotencyKeyRef.current = null;
          }
          throw error;
        }

        if (!created.success || !created.purchaseId) {
          const recovered = await recoverOnSiteSale({
            settingsId: context.settingsId,
            posCredential: credential,
            idempotencyKey: key,
          });
          if (recovered.status === "found") {
            return recoveredSaleResult(recovered.sale);
          }
          if (recovered.status === "unknown") {
            throw new Error("No pudimos verificar la venta pendiente");
          }

          clearPosIdempotencyKey(storageKey, key);
          idempotencyKeyRef.current = null;
        }
        return created;
      });

      if (!result.success || !result.purchaseId) {
        toast.error(result.message);
        return;
      }

      setLastSuccess({
        purchaseId: result.purchaseId,
        total: result.total ?? totalAmount,
        paidCount: result.ticketsIssued ?? paidCount,
        wristbandCount: result.wristbandCount ?? totalPriority,
      });
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos registrar la venta");
    } finally {
      setPending(false);
    }
  }

  async function startNewSale() {
    await withPosIdempotencyLock(storageKey, async () => {
      clearPosIdempotencyKey(storageKey);
      idempotencyKeyRef.current = null;
    });
    setLastSuccess(null);
    setPaidCount(1);
    setHolders([emptyHolder()]);
    setCashReceived("");
    setBuyerEmail("");
    setBuyerPhone("");
    setVoucherFile(null);
    setDetailsEnabled(context.onSiteVisitorDetailsRequired);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <header className="space-y-1 px-1">
        <p className="text-sm text-muted-foreground">
          {context.festivalDateLabel}
        </p>
        <h1 className="text-2xl font-bold">POS Pase Rápido</h1>
        <p className="text-sm">Operador: {context.operatorName}</p>
      </header>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-6 text-sm">
          <div>
            <p className="text-muted-foreground">Pases disponibles</p>
            <p className="font-semibold">{context.remainingPaid}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Capacidad prioritaria</p>
            <p className="font-semibold">{context.remainingPriority}</p>
          </div>
        </CardContent>
      </Card>

      {soldOut ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          No quedan pases disponibles para venta en sitio.
        </p>
      ) : null}

      {noPaymentMethod ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          No hay métodos de pago habilitados para venta en sitio. Pide a un
          administrador que active QR bancario o efectivo.
        </p>
      ) : null}

      {visibleSuccess ? (
        <Card>
          <CardHeader>
            <CardTitle>Venta registrada</CardTitle>
            <CardDescription>
              Venta #{visibleSuccess.purchaseId}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{visibleSuccess.paidCount} pase(s) pagado(s)</p>
            <p>{visibleSuccess.wristbandCount} pulsera(s) por entregar</p>
            <p className="font-semibold">{formatMoney(visibleSuccess.total)}</p>
            <Button className="w-full" size="lg" onClick={startNewSale}>
              Nueva venta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nueva venta</CardTitle>
              <CardDescription>
                {formatMoney(context.price)} por pase
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset disabled={formBlocked || pending} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="paidCount">Cantidad de pases</Label>
                  <Input
                    id="paidCount"
                    type="number"
                    min={1}
                    max={Math.max(context.remainingPaid, 1)}
                    value={paidCount}
                    onChange={(event) =>
                      updatePaidCount(parseInt(event.target.value, 10) || 1)
                    }
                  />
                </div>

                {Array.from({ length: paidCount }).map((_, index) => {
                  const holder = holders[index] ?? emptyHolder();
                  return (
                    <div
                      key={index}
                      className="space-y-3 rounded-md border p-3"
                    >
                      <p className="text-sm font-medium">Titular {index + 1}</p>

                      {detailsEnabled ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`firstName-${index}`}>
                              Nombre *
                            </Label>
                            <Input
                              id={`firstName-${index}`}
                              value={holder.firstName}
                              required
                              onChange={(event) =>
                                updateHolder(index, {
                                  firstName: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`lastName-${index}`}>
                              Apellido *
                            </Label>
                            <Input
                              id={`lastName-${index}`}
                              value={holder.lastName}
                              required
                              onChange={(event) =>
                                updateHolder(index, {
                                  lastName: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label htmlFor={`child-${index}`}>
                          Menores del titular {index + 1} (máx.{" "}
                          {FAST_PASS_MAX_CHILDREN_PER_ADULT})
                        </Label>
                        <Input
                          id={`child-${index}`}
                          type="number"
                          min={0}
                          max={FAST_PASS_MAX_CHILDREN_PER_ADULT}
                          value={holder.responsibleChildCount}
                          onChange={(event) => {
                            const parsed =
                              parseInt(event.target.value, 10) || 0;
                            const value = Math.min(
                              FAST_PASS_MAX_CHILDREN_PER_ADULT,
                              Math.max(0, parsed),
                            );
                            updateHolder(index, {
                              responsibleChildCount: value,
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                {!context.onSiteVisitorDetailsRequired ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDetailsEnabled((value) => !value)}
                  >
                    {detailsEnabled
                      ? "Quitar datos del visitante"
                      : "Agregar datos del visitante"}
                  </Button>
                ) : null}

                {detailsEnabled ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="buyerEmail">Correo de contacto</Label>
                      <Input
                        id="buyerEmail"
                        type="email"
                        value={buyerEmail}
                        onChange={(event) => setBuyerEmail(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="buyerPhone">Teléfono de contacto</Label>
                      <Input
                        id="buyerPhone"
                        type="tel"
                        value={buyerPhone}
                        onChange={(event) => setBuyerPhone(event.target.value)}
                      />
                    </div>
                    {context.onSiteVisitorDetailsRequired ? (
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        Completa al menos un método de contacto.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Método de pago</Label>
                  <Select
                    value={paymentMethod ?? undefined}
                    onValueChange={(value) =>
                      setPaymentMethod(value as PaymentMethod)
                    }
                  >
                    <SelectTrigger id="paymentMethod">
                      <SelectValue placeholder="Selecciona un método" />
                    </SelectTrigger>
                    <SelectContent>
                      {context.onSiteBankQrEnabled ? (
                        <SelectItem value="bank_qr">QR bancario</SelectItem>
                      ) : null}
                      {context.onSiteCashEnabled ? (
                        <SelectItem value="cash">Efectivo</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>

                {paymentMethod === "cash" ? (
                  <div className="space-y-2">
                    <Label htmlFor="cashReceived">Efectivo recibido (Bs)</Label>
                    <Input
                      id="cashReceived"
                      type="number"
                      step="0.01"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                    />
                  </div>
                ) : null}

                {paymentMethod === "bank_qr" ? (
                  <div className="space-y-2">
                    <Label htmlFor="voucherFile">
                      Comprobante{" "}
                      {context.onSiteProofRequired ? "*" : "(opcional)"}
                    </Label>
                    <Input
                      id="voucherFile"
                      type="file"
                      accept="image/*"
                      required={context.onSiteProofRequired}
                      onChange={(event) =>
                        setVoucherFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                ) : null}

                <div className="rounded-md bg-muted p-3 text-sm">
                  <p>
                    Total: <strong>{formatMoney(totalAmount)}</strong>
                  </p>
                  <p>
                    Personas prioritarias: <strong>{totalPriority}</strong>
                  </p>
                </div>
              </fieldset>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={formBlocked || pending || !paymentMethod}
              >
                {pending ? "Registrando…" : "Confirmar venta y pulseras"}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}

      {context.recentSales.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ventas recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {context.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <span>#{sale.id}</span>
                <span>
                  {sale.paidCount} pase(s) · {formatMoney(sale.totalAmount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
