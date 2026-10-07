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
  /** How "every kind of bulk mail" reads, for an all-mail opt-out. */
  allTopicsLabel: string;
  /** Unsubscribed from the link's topic. */
  unsubscribed: boolean;
  /**
   * Unsubscribed from all bulk mail, usually by asking support. The page then
   * says so, so that undoing it is a choice about all of it, not one topic.
   */
  unsubscribedFromAll: boolean;
  /**
   * Mail to this address bounced or was reported as spam: Resend delivers
   * nothing to it, so offering to resubscribe would promise mail that never
   * comes.
   */
  blocked: boolean;
};

/**
 * Asks before unsubscribing, since link scanners open every link in an
 * email, and offers to undo it right after.
 */
export default function UnsubscribeCard(props: UnsubscribeCardProps) {
  const [fromAll, setFromAll] = useState(props.unsubscribedFromAll);
  const [topicOnly, setTopicOnly] = useState(props.unsubscribed);
  const [pending, startTransition] = useTransition();
  const unsubscribed = fromAll || topicOnly;
  const label = fromAll ? props.allTopicsLabel : props.topicLabel;

  function run(action: typeof confirmUnsubscribe, next: boolean) {
    startTransition(async () => {
      const result = await action(props.token);
      if (result.success) {
        // Undoing lifts the all-mail opt-out too; subscribing again is
        // always for this link's topic.
        setFromAll(false);
        setTopicOnly(next);
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
            ? `Ya no enviaremos ${label} a ${props.maskedEmail}.`
            : `Dejarás de recibir ${label} en ${props.maskedEmail}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        {props.blocked ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            Por ahora no podemos enviarte ningún correo, ni siquiera tus
            entradas o reservas, porque un mensaje anterior no se pudo entregar
            o fue marcado como spam. Si quieres volver a recibirlos, escríbenos
            a{" "}
            <a
              href="mailto:soporte@productoraglitter.com"
              className="font-medium underline"
            >
              soporte@productoraglitter.com
            </a>
            .
          </p>
        ) : (
          <p>
            Seguirás recibiendo los correos que pidas tú, como tus entradas o
            reservas.
          </p>
        )}
      </CardContent>
      <CardFooter>
        {unsubscribed && props.blocked ? null : unsubscribed ? (
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
