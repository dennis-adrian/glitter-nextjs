"use client";

import EmailAdminActionButton from "@/app/components/emails/admin/email-admin-action-button";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  notificationLogKindLabel,
  type NotificationLogRow,
  type NotificationLogStatus,
} from "@/app/lib/notifications/admin-log-definitions";
import { resendFailedNotificationEmailAction } from "@/app/lib/notifications/admin-resend-actions";

const RESENT_STATUS: Record<NotificationLogStatus, string> = {
  pending: "en cola",
  processing: "enviándose",
  sent: "aceptado por Resend",
  failed: "también falló",
  skipped: "omitido",
};

function personName(
  person: { userId: number; name: string | null } | null,
): string {
  if (!person) return "un administrador";
  return person.name ?? `la cuenta #${person.userId}`;
}

/**
 * A delivery row's resend: who asked for it when the row is one, whether it
 * was sent again (and how that went), and "Reenviar correo" on a failed
 * transactional email nobody resent yet.
 */
export function NotificationLogResendCell({ row }: { row: NotificationLogRow }) {
  const resend = row.resend;
  if (!resend) return null;
  const { requestedBy, resentAs, eligible } = resend;
  if (!requestedBy && !resentAs && !eligible) return null;

  const recipient =
    row.recipient.name ??
    (row.recipient.userId !== null
      ? `Cuenta #${row.recipient.userId}`
      : "Sin cuenta");
  const what = notificationLogKindLabel(row.kind);

  return (
    <div className="min-w-0 max-w-72 space-y-1 text-xs text-muted-foreground">
      {requestedBy ? (
        <p className="break-words">
          Reenvío pedido por {personName(requestedBy)}.
        </p>
      ) : null}
      {resentAs ? (
        <p className="break-words">
          Reenviado el {formatDateWithTime(resentAs.at)} por{" "}
          {personName(resentAs.by)}:{" "}
          {RESENT_STATUS[resentAs.status]}.
        </p>
      ) : null}
      {eligible ? (
        <EmailAdminActionButton
          label="Reenviar correo"
          ariaLabel={`Reenviar correo a ${recipient}`}
          pendingLabel="Reenviando…"
          title="¿Reenviar este correo?"
          confirmLabel="Reenviar"
          run={() =>
            resendFailedNotificationEmailAction({ deliveryId: row.id })
          }
          description={
            <>
              <p className="break-words">
                Le enviamos de nuevo «{what}» a{" "}
                <span className="font-medium text-foreground">{recipient}</span>
                {row.recipient.email ? (
                  <>
                    {" "}
                    (
                    <span className="wrap-anywhere">
                      {row.recipient.email}
                    </span>
                    )
                  </>
                ) : null}
                .
              </p>
              {row.reserved ? (
                <p>
                  Contenido reservado: se lee en el caso, no aquí.
                </p>
              ) : row.title ? (
                <p className="break-words">Aviso: {row.title}</p>
              ) : null}
              <p>
                Es el mismo correo que falló, enviado como un envío nuevo: la
                fila que falló queda como está y el reenvío aparece en la
                lista con su propio estado.
              </p>
            </>
          }
        />
      ) : null}
    </div>
  );
}
