"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
import { activateFastPassTicket } from "@/app/lib/fast-pass/review-actions";
import { formatFullDate } from "@/app/lib/formatters";

export type FastPassCheckInDateOption = {
  festivalDateId: number;
  startDate: Date;
};

type Props = {
  dates: FastPassCheckInDateOption[];
};

export default function FastPassCheckInForm({ dates }: Props) {
  const router = useRouter();
  const [festivalDateId, setFestivalDateId] = useState<string>(
    dates[0] ? String(dates[0].festivalDateId) : "",
  );
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"qr" | "manual" | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const ticketCodeRef = useRef<HTMLInputElement>(null);

  async function submit(method: "qr_scan" | "manual", submittedCode = code) {
    if (!festivalDateId || !submittedCode.trim()) {
      toast.error("Selecciona el día e ingresa el código");
      return;
    }

    setPending(method === "qr_scan" ? "qr" : "manual");
    setLastResult(null);
    try {
      const result = await activateFastPassTicket({
        festivalDateId: parseInt(festivalDateId, 10),
        code: submittedCode.trim(),
        method,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      setLastResult(result.message);
      toast.success(result.message);
      setCode("");
      router.refresh();
    } catch {
      toast.error("No pudimos activar el ticket");
    } finally {
      setPending(null);
      ticketCodeRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Activación de entrada</CardTitle>
          <CardDescription>
            Escanea el QR del ticket o ingresa el código manualmente. Entrega la
            pulsera al visitante tras validar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Día de festival</Label>
            <Select value={festivalDateId} onValueChange={setFestivalDateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una fecha" />
              </SelectTrigger>
              <SelectContent>
                {dates.map((date) => (
                  <SelectItem
                    key={date.festivalDateId}
                    value={String(date.festivalDateId)}
                  >
                    {formatFullDate(date.startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticketCode">Código del ticket</Label>
            <Input
              ref={ticketCodeRef}
              id="ticketCode"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (pending !== null) return;
                void submit("qr_scan", event.currentTarget.value);
              }}
              placeholder="Escanea o escribe el código"
              autoComplete="off"
              className="text-lg"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="lg"
              disabled={pending !== null}
              onClick={() => submit("qr_scan")}
            >
              {pending === "qr" ? "Validando…" : "Activar (QR)"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              disabled={pending !== null}
              onClick={() => submit("manual")}
            >
              {pending === "manual" ? "Validando…" : "Activar (manual)"}
            </Button>
          </div>

          {lastResult ? (
            <p className="rounded-md bg-muted p-3 text-sm">{lastResult}</p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Interfaz optimizada para móvil en el acceso prioritario Pase Rápido.
      </p>
    </div>
  );
}
