"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { TicketBase } from "@/app/data/tickets/actions";
import { fetchPublicVisitorByEmail } from "@/app/data/visitors/queries";
import { db } from "@/db";
import { eventDiscoveryEnum, genderEnum, visitors } from "@/db/schema";

export type NewVisitor = typeof visitors.$inferInsert;
export type VisitorBase = typeof visitors.$inferSelect;
export type VisitorWithTickets = VisitorBase & {
  tickets: TicketBase[];
};
/**
 * What the public registration pages may know about a visitor: the name printed
 * on their tickets, the tickets, and the email the caller typed to find them —
 * `createTicket` is keyed on it. Never the phone, birthdate or gender.
 */
export type PublicVisitor = Pick<
  VisitorBase,
  "id" | "firstName" | "lastName" | "email"
> & {
  tickets: TicketBase[];
};

/**
 * Public: the registration asks for an email first and continues with the
 * visitor's tickets when the address is already registered.
 */
export async function fetchVisitorByEmail(
  email: string,
): Promise<PublicVisitor | null> {
  const parsedEmail = z.email().safeParse(email);
  if (!parsedEmail.success) return null;

  return await fetchPublicVisitorByEmail(parsedEmail.data);
}

/**
 * The fields a visitor fills in. Anything else a caller sends — an id, the
 * timestamps — is dropped, so a registration cannot claim a row id ahead of
 * the sequence.
 */
const NewVisitorSchema = z.object({
  firstName: z.string().trim().max(200).nullish(),
  lastName: z.string().trim().max(200).nullish(),
  email: z.email(),
  phoneNumber: z.string().trim().min(1).max(50),
  gender: z.enum(genderEnum.enumValues).optional(),
  eventDiscovery: z.enum(eventDiscoveryEnum.enumValues).optional(),
  birthdate: z.date(),
});

/** Public: anyone may register as a visitor. */
export async function createVisitor(visitor: NewVisitor) {
  const parsed = NewVisitorSchema.safeParse(visitor);
  if (!parsed.success) {
    return {
      success: false,
      error: "Error creando visitante",
    };
  }

  let createdVisitor = null;
  try {
    const [newVisitor] = await db
      .insert(visitors)
      .values(parsed.data)
      .returning();
    createdVisitor = newVisitor;
  } catch (error) {
    console.error("Error creando visitante", error);
    return {
      success: false,
      error: "Error creando visitante",
    };
  }

  revalidatePath("/festivals");
  return { success: true, visitor: createdVisitor };
}
