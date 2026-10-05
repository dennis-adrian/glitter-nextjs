"use client";

import { MailCheckIcon, MailXIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  confirmUnsubscribe,
  undoUnsubscribe,
} from "@/app/lib/emails/unsubscribe-actions";

type UnsubscribeCardProps = {
  token: string;
  /** The address, partly hidden: "ca••••@gmail.com". */
  maskedEmail: string;
  /** What they stop receiving: "las invitaciones para acreditarte…". */
  topicLabel: string;
  unsubscribed: boolean;
};

/**
 * Asks before unsubscribing, since link scanners open every link in an
 * email, and offers to undo it right after.
 */
export default function UnsubscribeCard(props: UnsubscribeCardProps) {
  const [unsubscribed, setUnsubscribed] = useState(props.unsubscribed);
  const [pending, startTransition] = useTransition();

  function run(action: typeof confirmUnsubscribe, next: boolean) {
    startTransition(async () => {
      const result = await action(props.token);
      if (result.success) {
        setUnsubscribed(next);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  const Icon = unsubscribed ? MailXIcon : MailCheckIcon;

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <Icon className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
        <CardTitle>
          {unsubscribed ? "Te diste de baja" : "¿Darte de baja?"}
        </CardTitle>
        <CardDescription>
          {unsubscribed
            ? `Ya no enviaremos ${props.topicLabel} a ${props.maskedEmail}.`
            : `Dejarás de recibir ${props.topicLabel} en ${props.maskedEmail}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Seguirás recibiendo los correos que pidas tú, como tus entradas o
        reservas.
      </CardContent>
      <CardFooter>
        {unsubscribed ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(undoUnsubscribe, false)}
          >
            Volver a suscribirme
          </Button>
        ) : (
          <Button
            disabled={pending}
            onClick={() => run(confirmUnsubscribe, true)}
          >
            Darme de baja
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
