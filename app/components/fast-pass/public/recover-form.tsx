"use client";

import { useState } from "react";
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
import { recoverFastPassPurchaseLink } from "@/app/lib/fast-pass/checkout-actions";

type Props = {
  initialPurchaseId?: string;
};

export default function FastPassRecoverForm({
  initialPurchaseId = "",
}: Props) {
  const [email, setEmail] = useState("");
  const [purchaseId, setPurchaseId] = useState(initialPurchaseId);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedId = parseInt(purchaseId, 10);
    if (!email.trim() || !Number.isInteger(parsedId) || parsedId <= 0) {
      toast.error("Ingresa un correo y número de compra válidos");
      return;
    }

    setPending(true);
    try {
      const result = await recoverFastPassPurchaseLink({
        email: email.trim(),
        purchaseId: parsedId,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setSent(true);
      toast.success(result.message);
    } catch {
      toast.error("No pudimos procesar tu solicitud");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar enlace de compra</CardTitle>
        <CardDescription>
          Si perdiste el enlace seguro de tu Pase Rápido, te lo reenviamos al
          correo del comprador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            Si encontramos una compra con esos datos, recibirás un correo con el
            enlace seguro en breve.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo del comprador</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseId">Número de compra</Label>
              <Input
                id="purchaseId"
                inputMode="numeric"
                value={purchaseId}
                onChange={(event) => setPurchaseId(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar enlace"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
