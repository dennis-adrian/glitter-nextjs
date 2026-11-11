import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import NotificationLogTable from "@/app/components/notifications/admin/notification-log-table";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { NotificationLogSearchParamsSchema } from "@/app/lib/notifications/admin-log-definitions";
import { fetchNotificationLogPage } from "@/app/lib/notifications/admin-log-queries";

export const metadata: Metadata = {
  title: "Notificaciones enviadas",
};

/**
 * What we sent, to whom and how it went: inbox items, emails and pushes,
 * newest first. Read-only; resending lives on each comunicado's report.
 */
export default async function NotificationLogPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const params = NotificationLogSearchParamsSchema.parse(searchParams);
  // A layout is not a boundary: the query refuses anyone but an admin.
  const page = await fetchNotificationLogPage(params);
  if (!page) redirect("/dashboard");

  const filtered =
    params.query !== "" ||
    params.channel.length > 0 ||
    params.status.length > 0 ||
    Boolean(params.from || params.to);

  return (
    <div className="container flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-6">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-2xl font-bold md:text-3xl" data-installed-title="">
          Notificaciones enviadas
        </h1>
        <p className="text-sm text-muted-foreground">
          Lo que mandamos a cada persona en la app, por correo y como aviso
          push, de lo más reciente a lo más antiguo.
        </p>
      </div>

      {/* Both limits in the summary, so a closed box still says them. */}
      <details className="shrink-0 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium break-words text-foreground">
          «Aceptado» no quiere decir que llegó, y los correos de inicio de
          sesión no aparecen.
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            Aparece cada correo que manda la aplicación, también los de pedidos,
            entradas, invitaciones a festivales, programas, actividades, tareas
            del perfil y cuenta. No aparecen los códigos de acceso ni los
            correos de verificación e inicio de sesión: esos los envía Clerk, no
            la aplicación.
          </p>
          <p>
            «Aceptado» significa que Resend o el servicio push tomó el mensaje,
            no que llegó ni que se abrió. Los rebotes y reportes de spam se ven
            en{" "}
            <Link
              href="/dashboard/emails"
              className="text-primary underline-offset-2 hover:underline"
            >
              Correos bloqueados
            </Link>
            .
          </p>
        </div>
      </details>

      <div className="flex min-h-0 flex-1 flex-col">
        <NotificationLogTable
          rows={page.rows}
          rowCount={page.total}
          filtered={filtered}
        />
      </div>
    </div>
  );
}
