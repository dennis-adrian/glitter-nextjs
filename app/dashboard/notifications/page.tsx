import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import NotificationLogTable from "@/app/components/notifications/admin/notification-log-table";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";
import { buttonVariants } from "@/app/components/ui/button";
import {
  notificationLogHrefWithoutUser,
  NotificationLogSearchParamsSchema,
  type NotificationLogPerson,
} from "@/app/lib/notifications/admin-log-definitions";
import {
  fetchNotificationLogPage,
  fetchNotificationLogPerson,
} from "@/app/lib/notifications/admin-log-queries";

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
  const person =
    params.user !== undefined
      ? await fetchNotificationLogPerson(params.user)
      : null;

  const filtered =
    params.query !== "" ||
    params.channel.length > 0 ||
    params.status.length > 0 ||
    params.user !== undefined ||
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
          No aparecen todos los correos, y «Aceptado» no quiere decir que llegó.
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            Faltan los correos que se envían directo, sin quedar registrados:
            pedidos de la tienda, entradas, invitaciones a festivales,
            programas, actividades y listas de espera, recordatorios de tareas
            del perfil y correos de la cuenta. Las copias en la app y los avisos
            push de las invitaciones sí aparecen.
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

      {person ? (
        <PersonBanner
          person={person}
          clearHref={notificationLogHrefWithoutUser(searchParams)}
        />
      ) : null}

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

/** The log is filtered to one account: who, what counts, and the way out. */
function PersonBanner({
  person,
  clearHref,
}: {
  person: NotificationLogPerson;
  clearHref: string;
}) {
  const exists = person.name !== null || person.email !== null;
  return (
    <section
      aria-label="Filtro por persona"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm"
    >
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-muted-foreground">Solo lo enviado a</p>
        {exists ? (
          <Link
            href={`/dashboard/users/${person.id}`}
            className="font-medium break-words underline-offset-2 hover:underline"
          >
            {person.name ?? person.email} · #{person.id}
          </Link>
        ) : (
          <p className="font-medium">Cuenta #{person.id} (no existe)</p>
        )}
        {person.email ? (
          <p className="text-xs text-muted-foreground">
            Incluye los correos a{" "}
            <span className="wrap-anywhere">{person.email}</span> que no
            quedaron asociados a ninguna cuenta.
          </p>
        ) : null}
      </div>
      <Link
        href={clearHref}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          wrap: true,
          className: "shrink-0",
        })}
      >
        Ver a todas las personas
      </Link>
    </section>
  );
}
