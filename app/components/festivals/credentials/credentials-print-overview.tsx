"use client";

import { PrinterIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { deleteCredentialPrintBatch } from "@/app/lib/credentials/actions";
import { CREDENTIALS_COPY } from "@/app/lib/credentials/definitions";
import { toastActionError } from "@/app/lib/errors/action-error";
import { formatDisplayDate } from "@/app/lib/formatters";

const number = (value: number) => value.toLocaleString("es-BO");
const longDate = (date: Date) => formatDisplayDate(date, { day: "numeric", month: "long" });

function people(count: number) {
  return `${number(count)} ${count === 1 ? "persona" : "personas"}`;
}

/**
 * What changed since the last batch, above the breakdown. Hidden until the
 * festival has a batch, and while nothing changed.
 */
export function CredentialsPrintNotice() {
  const { view, hrefFor } = useCredentials();
  const { lastBatch, pendingCredentials, pendingHolders, surplusHolders, staleCredentials } =
    view.print;
  if (!lastBatch) return null;
  if (pendingHolders === 0 && surplusHolders === 0 && staleCredentials === 0) return null;

  const parts: string[] = [];
  if (pendingHolders > 0) {
    parts.push(`${people(pendingHolders)} ${pendingHolders === 1 ? "tiene" : "tienen"} credenciales nuevas o que faltan`);
  }
  if (surplusHolders > 0) {
    parts.push(`${people(surplusHolders)} ${surplusHolders === 1 ? "tiene" : "tienen"} credenciales de más`);
  }
  if (staleCredentials > 0) {
    parts.push(
      `${number(staleCredentials)} ${staleCredentials === 1 ? "credencial ya impresa dejó" : "credenciales ya impresas dejaron"} de corresponder`,
    );
  }
  const sentence =
    parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;

  return (
    <Alert>
      <PrinterIcon className="h-4 w-4" aria-hidden />
      <AlertTitle>
        {pendingCredentials > 0
          ? `${number(pendingCredentials)} ${pendingCredentials === 1 ? "credencial nueva" : "credenciales nuevas"} desde la última impresión`
          : "Cambios desde la última impresión"}
      </AlertTitle>
      <AlertDescription>
        El {longDate(lastBatch.createdAt)} marcaste {number(lastBatch.sent)} como enviadas a
        imprenta. Desde entonces, {sentence}.{" "}
        <Link href={hrefFor("nombres")} scroll={false} className="font-medium underline">
          Revisalas en Nombres
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

/** "Última impresión": the last batch and what changed since. */
export function CredentialsLastPrintCard() {
  const { view, festivalId, isAdmin } = useCredentials();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { lastBatch, pendingCredentials, surplusHolders, staleCredentials, batches } = view.print;
  if (!lastBatch) return null;

  function undo() {
    startTransition(async () => {
      try {
        const result = await deleteCredentialPrintBatch({ festivalId, batchId: lastBatch!.id });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toastActionError(error, CREDENTIALS_COPY.genericError);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Última impresión</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Fecha</dt>
            <dd className="text-right">{longDate(lastBatch.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Enviadas</dt>
            <dd className="tabular-nums">{number(lastBatch.sent)}</dd>
          </div>
          {lastBatch.note ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Nota</dt>
              <dd className="min-w-0 break-words text-right">{lastBatch.note}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Nuevas desde entonces</dt>
            <dd>
              {pendingCredentials > 0 ? (
                <Badge variant="amber">
                  {number(pendingCredentials)} {pendingCredentials === 1 ? "nueva" : "nuevas"}
                </Badge>
              ) : (
                <span className="tabular-nums">0</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">De más</dt>
            <dd>
              {surplusHolders > 0 ? (
                <Badge variant="outline">{people(surplusHolders)}</Badge>
              ) : (
                <span className="tabular-nums">0</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Ya no corresponden</dt>
            <dd>
              {staleCredentials > 0 ? (
                <Badge variant="red">{number(staleCredentials)} de baja</Badge>
              ) : (
                <span className="tabular-nums">0</span>
              )}
            </dd>
          </div>
        </dl>
        {batches > 1 && (
          <p className="text-xs text-muted-foreground">
            Esta edición tiene {number(batches)} envíos a imprenta.
          </p>
        )}
        {isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" wrap disabled={isPending} className="self-start">
                Deshacer este envío
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Deshacer el último envío a imprenta?</AlertDialogTitle>
                <AlertDialogDescription>
                  {lastBatch.sent === 1
                    ? "Se borra el registro de la credencial marcada el "
                    : `Se borra el registro de las ${number(lastBatch.sent)} credenciales marcadas el `}
                  {longDate(lastBatch.createdAt)}, y el estado de impresión se vuelve a calcular sin
                  ese envío. Usalo solo si lo marcaste por error.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={undo}>Deshacer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
