"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccessFromSubject } from "@/app/lib/fast-pass/access";
import {
  allocateFestivalTicketNumber,
  lockFestivalTicketAllocation,
} from "@/app/lib/tickets/number-allocation";
import { db } from "@/db";
import {
  fastPassEvents,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassTickets,
  festivalDates,
  tickets,
  visitors,
} from "@/db/schema";

const holderUpdateSchema = z.object({
  purchaseId: z.number().int().positive(),
  purchaseLineId: z.number().int().positive(),
  token: z.string().trim().min(1).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(1).max(40),
  gender: z.enum(["male", "female", "non_binary", "other", "undisclosed"]),
  birthdate: z.coerce.date(),
});

export async function updateFastPassHolder(
  input: z.input<typeof holderUpdateSchema>,
) {
  const blocked = await featureFlagGuard("fast_pass");
  if (blocked) return blocked;

  const parsed = holderUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Datos inválidos" };
  const data = parsed.data;
  const normalizedEmail = data.email.toLowerCase();
  const cutoff = new Date();
  cutoff.setHours(23, 59, 59, 999);
  cutoff.setFullYear(cutoff.getFullYear() - 11);
  if (data.birthdate > cutoff) {
    return { success: false, message: "El titular debe tener 11 años o más" };
  }

  const now = new Date();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(fastPassPurchases)
        .where(eq(fastPassPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);
      if (
        !purchase ||
        purchase.channel !== "online" ||
        purchase.status !== "approved" ||
        !resolvePurchaseAccessFromSubject(purchase, data.token).granted
      ) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }

      const [line] = await tx
        .select({
          line: fastPassPurchaseLines,
          ticket: fastPassTickets,
        })
        .from(fastPassPurchaseLines)
        .innerJoin(
          fastPassTickets,
          eq(fastPassTickets.purchaseLineId, fastPassPurchaseLines.id),
        )
        .where(
          and(
            eq(fastPassPurchaseLines.id, data.purchaseLineId),
            eq(fastPassPurchaseLines.purchaseId, purchase.id),
          ),
        )
        .for("update")
        .limit(1);
      if (!line || line.ticket.status !== "valid") {
        return {
          kind: "error" as const,
          message: "El titular ya no puede modificarse",
        };
      }
      const originalFestivalTicketId = line.line.festivalTicketId;

      const [festivalInfo] = await tx
        .select({
          festivalId: festivalDates.festivalId,
          startDate: festivalDates.startDate,
        })
        .from(festivalDates)
        .where(eq(festivalDates.id, purchase.festivalDateId))
        .limit(1);
      if (!festivalInfo) {
        return { kind: "error" as const, message: "Día no encontrado" };
      }
      await lockFestivalTicketAllocation(tx, festivalInfo.festivalId);

      const [existingVisitor] = await tx
        .select({ id: visitors.id })
        .from(visitors)
        .where(sql`lower(${visitors.email}) = lower(${normalizedEmail})`)
        .limit(1);
      let visitorId = existingVisitor?.id ?? null;
      if (!visitorId) {
        const inserted = await tx
          .insert(visitors)
          .values({
            firstName: data.firstName,
            lastName: data.lastName,
            email: normalizedEmail,
            phoneNumber: data.phone,
            gender: data.gender,
            birthdate: data.birthdate,
            eventDiscovery: "other",
          })
          .onConflictDoNothing({ target: visitors.email })
          .returning({ id: visitors.id });
        visitorId = inserted[0]?.id ?? null;
        if (!visitorId) {
          const [racedVisitor] = await tx
            .select({ id: visitors.id })
            .from(visitors)
            .where(sql`lower(${visitors.email}) = lower(${normalizedEmail})`)
            .limit(1);
          visitorId = racedVisitor?.id ?? null;
        }
      }
      if (!visitorId) {
        return {
          kind: "error" as const,
          message: "No pudimos asignar el titular",
        };
      }

      const numberOfVisitors = 1 + line.line.responsibleChildCount;
      const [existingFestivalTicket] = await tx
        .select({
          id: tickets.id,
          numberOfVisitors: tickets.numberOfVisitors,
        })
        .from(tickets)
        .where(
          and(
            eq(tickets.visitorId, visitorId),
            eq(tickets.festivalId, festivalInfo.festivalId),
            eq(tickets.date, festivalInfo.startDate),
            eq(tickets.createdByFastPass, true),
            isNull(tickets.retiredAt),
          ),
        )
        .limit(1);
      let festivalTicketId = existingFestivalTicket?.id ?? null;
      if (festivalTicketId) {
        await tx
          .update(tickets)
          .set({
            numberOfVisitors: Math.max(
              existingFestivalTicket.numberOfVisitors,
              numberOfVisitors,
            ),
            updatedAt: now,
          })
          .where(eq(tickets.id, festivalTicketId));
      } else {
        const ticketNumber = await allocateFestivalTicketNumber(
          tx,
          festivalInfo.festivalId,
        );
        const [created] = await tx
          .insert(tickets)
          .values({
            date: festivalInfo.startDate,
            visitorId,
            festivalId: festivalInfo.festivalId,
            ticketNumber,
            numberOfVisitors,
            createdByFastPass: true,
          })
          .returning({ id: tickets.id });
        festivalTicketId = created.id;
      }

      await tx
        .update(fastPassPurchaseLines)
        .set({
          holderFirstName: data.firstName,
          holderLastName: data.lastName,
          holderEmail: normalizedEmail,
          holderPhone: data.phone,
          holderGender: data.gender,
          holderBirthdate: data.birthdate.toISOString().slice(0, 10),
          visitorId,
          festivalTicketId,
          updatedAt: now,
        })
        .where(eq(fastPassPurchaseLines.id, line.line.id));
      await tx
        .update(fastPassTickets)
        .set({
          holderFirstName: data.firstName,
          holderLastName: data.lastName,
          holderEmail: normalizedEmail,
          festivalTicketId,
          updatedAt: now,
        })
        .where(eq(fastPassTickets.id, line.ticket.id));

      if (
        originalFestivalTicketId &&
        originalFestivalTicketId !== festivalTicketId
      ) {
        const [ownedTicket] = await tx
          .select({ id: tickets.id })
          .from(tickets)
          .where(
            and(
              eq(tickets.id, originalFestivalTicketId),
              eq(tickets.createdByFastPass, true),
            ),
          )
          .for("update")
          .limit(1);
        const [otherOwner] = await tx
          .select({ id: fastPassPurchaseLines.id })
          .from(fastPassPurchaseLines)
          .where(
            and(
              eq(
                fastPassPurchaseLines.festivalTicketId,
                originalFestivalTicketId,
              ),
              ne(fastPassPurchaseLines.id, line.line.id),
            ),
          )
          .limit(1);

        if (ownedTicket && !otherOwner) {
          await tx
            .update(tickets)
            .set({ retiredAt: now, updatedAt: now })
            .where(eq(tickets.id, originalFestivalTicketId));
        }
      }
      await tx.insert(fastPassEvents).values({
        purchaseId: purchase.id,
        actorType: "buyer",
        eventType: "holder_updated",
        changes: { purchaseLineId: line.line.id, ticketId: line.ticket.id },
      });

      return { kind: "done" as const };
    });

    if (outcome.kind === "error")
      return { success: false, message: outcome.message };
    revalidatePath(`/fast-pass/purchases/${data.purchaseId}`);
    return { success: true, message: "Titular actualizado" };
  } catch (error) {
    console.error("FastPass holder update failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: "No pudimos actualizar el titular" };
  }
}
