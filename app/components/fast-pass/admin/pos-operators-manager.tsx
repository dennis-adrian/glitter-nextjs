"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
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
import {
  createPosOperator,
  revokePosOperator,
} from "@/app/lib/fast-pass/admin-actions";
import type { FastPassPosOperatorRow } from "@/app/lib/fast-pass/purchase-queries";
import { formatDateWithTime, formatFullDate } from "@/app/lib/formatters";
import { toDateTimeLocal } from "@/app/lib/programs/form-schemas";

export type FastPassOperatorDateOption = {
  festivalDateId: number;
  settingsId: number | null;
  startDate: Date;
};

type Props = {
  dates: FastPassOperatorDateOption[];
  operators: FastPassPosOperatorRow[];
};

export default function FastPassPosOperatorsManager({
  dates,
  operators,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [settingsId, setSettingsId] = useState<string>(
    dates.find((date) => date.settingsId)?.settingsId
      ? String(dates.find((date) => date.settingsId)!.settingsId)
      : "",
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState<number | "create" | null>(null);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [createdCredential, setCreatedCredential] = useState<{
    operatorName: string;
    credential: string;
    posUrl: string;
  } | null>(null);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now());
    updateCurrentTime();
    const timer = window.setInterval(updateCurrentTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !settingsId || !expiresAt) {
      toast.error("Completa todos los campos");
      return;
    }

    setPending("create");
    try {
      const result = await createPosOperator(parseInt(settingsId, 10), {
        displayName: displayName.trim(),
        expiresAt: new Date(expiresAt),
      });

      if (!result.success || !result.credential) {
        toast.error(result.message);
        return;
      }

      const posUrl = `${window.location.origin}/fast-pass/pos/${encodeURIComponent(result.credential)}`;
      setCreatedCredential({
        operatorName: displayName.trim(),
        credential: result.credential,
        posUrl,
      });
      setDisplayName("");
      setExpiresAt("");
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos crear el operador");
    } finally {
      setPending(null);
    }
  }

  async function handleRevoke(operatorId: number) {
    const reason = window.prompt("Motivo de revocación (mínimo 3 caracteres)");
    if (!reason || reason.trim().length < 3) {
      toast.error("Escribe un motivo válido");
      return;
    }

    setPending(operatorId);
    try {
      const result = await revokePosOperator(operatorId, reason);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos revocar el operador");
    } finally {
      setPending(null);
    }
  }

  const configuredDates = dates.filter((date) => date.settingsId);

  return (
    <div className="space-y-6">
      {createdCredential ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Credencial creada — guárdala ahora</CardTitle>
            <CardDescription>
              Solo se muestra una vez. Compártela de forma segura con{" "}
              {createdCredential.operatorName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">
              {createdCredential.credential}
            </div>
            <p className="text-sm">
              Enlace POS:{" "}
              <a
                href={createdCredential.posUrl}
                rel="noreferrer"
                className="text-primary underline break-all"
              >
                {createdCredential.posUrl}
              </a>
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreatedCredential(null)}
            >
              Entendido, ocultar credencial
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Nuevo operador POS</CardTitle>
          <CardDescription>
            Acceso restringido solo a ventas en sitio del día asignado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configuredDates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Configura Pase Rápido para al menos un día antes de crear
              operadores.
            </p>
          ) : (
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Nombre del operador</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="María López"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="festivalDay">Día de festival</Label>
                <Select value={settingsId} onValueChange={setSettingsId}>
                  <SelectTrigger id="festivalDay">
                    <SelectValue placeholder="Selecciona una fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    {configuredDates.map((date) => (
                      <SelectItem
                        key={date.festivalDateId}
                        value={String(date.settingsId)}
                      >
                        {formatFullDate(date.startDate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="expiresAt">Expira</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  min={
                    currentTime !== null
                      ? toDateTimeLocal(new Date(currentTime))
                      : undefined
                  }
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={pending !== null}>
                {pending === "create" ? "Creando…" : "Crear operador"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {operators.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay operadores POS configurados.
          </p>
        ) : (
          operators.map((operator) => {
            const isRevoked = !!operator.revokedAt;
            const isExpired =
              currentTime !== null &&
              new Date(operator.expiresAt).getTime() <= currentTime;

            return (
              <Card key={operator.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle>{operator.displayName}</CardTitle>
                      <CardDescription>
                        {operator.festivalDateLabel}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        isRevoked || isExpired ? "destructive" : "default"
                      }
                    >
                      {isRevoked
                        ? "Revocado"
                        : isExpired
                          ? "Expirado"
                          : "Activo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <dl className="grid gap-1">
                    <div>
                      <span className="text-muted-foreground">Expira: </span>
                      {formatDateWithTime(operator.expiresAt)}
                    </div>
                    {operator.lastUsedAt ? (
                      <div>
                        <span className="text-muted-foreground">
                          Último uso:{" "}
                        </span>
                        {formatDateWithTime(operator.lastUsedAt)}
                      </div>
                    ) : null}
                  </dl>
                  {!operator.revokedAt ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => handleRevoke(operator.id)}
                    >
                      {pending === operator.id ? "Revocando…" : "Revocar"}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
