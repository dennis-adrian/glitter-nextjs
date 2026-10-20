"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { VisitorBase } from "@/app/data/visitors/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { tickets } from "@/db/schema";

export type TicketBase = typeof tickets.$inferSelect;
export type TicketWithVisitor = TicketBase & { visitor: VisitorBase };

/**
 * Staff check-in. Visitors get their tickets through
 * `app/lib/visitors/registration-actions.ts`; these change a ticket's state,
 * so only admins and festival admins may call them.
 */

const ticketStatuses = ["pending", "checked_in"] as const;

export async function updateTicket(id: number, status: TicketBase["status"]) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { success: false, error: "No autorizado" };
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !ticketStatuses.includes(status)
  ) {
    return { success: false, error: "Entrada inválida" };
  }

  try {
    await db
      .update(tickets)
      .set({
        status,
        checkedInAt: status === "checked_in" ? sql`NOW()` : null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(tickets.id, id));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "No se pudo actualizar el estado de la entrada",
    };
  }

  revalidatePath("/dashboard/festivals");
  return {
    success: true,
    error: null,
  };
}

export async function verifyTicket(ticketNumber: number, festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { success: false, message: "No autorizado" };
  if (
    !Number.isInteger(ticketNumber) ||
    ticketNumber <= 0 ||
    !Number.isInteger(festivalId) ||
    festivalId <= 0
  ) {
    return { success: false, message: "La entrada no existe" };
  }

  try {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.festivalId, festivalId),
          eq(tickets.ticketNumber, ticketNumber),
        ),
      );

    if (!ticket) throw new Error("La entrada no existe");
    if (ticket.status === "checked_in") {
      throw new Error("Esta entrada ya ha sido verificada");
    }

    // Predicate on status closes the race where two concurrent verifies both
    // pass the read above; a zero-row update means the other won.
    //
    // The id pins the update to the row that was read. Nothing in the database
    // stops two tickets from sharing a festival and number, and without the id
    // one scan would check in every one of them at once.
    const updated = await db
      .update(tickets)
      .set({
        status: "checked_in",
        checkedInAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(tickets.id, ticket.id),
          eq(tickets.festivalId, festivalId),
          eq(tickets.ticketNumber, ticketNumber),
          ne(tickets.status, "checked_in"),
        ),
      )
      .returning({ id: tickets.id });

    if (updated.length !== 1) {
      throw new Error("Esta entrada ya ha sido verificada");
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return {
        success: false,
        message: error.message,
      };
    }

    return {
      success: false,
      message: "No se pudo verificar la entrada",
    };
  }

  revalidatePath("/dashboard/festivals");
  return {
    success: true,
    message: "Entrada verificada correctamente",
  };
}
