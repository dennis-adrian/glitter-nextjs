import "server-only";

/**
 * Server-side reads for visitors. None of them checks who is asking, so they
 * must never sit in a "use server" module, where every export is a public
 * endpoint. Callers authorize first, or hand out only what the function already
 * narrows to.
 */

import { asc, eq } from "drizzle-orm";

import type {
  PublicVisitor,
  VisitorWithTickets,
} from "@/app/data/visitors/actions";
import { db } from "@/db";
import { tickets, visitors } from "@/db/schema";

/** The whole visitor row with every ticket. For staff screens only. */
export async function fetchVisitor(
  visitorId: number,
): Promise<VisitorWithTickets | undefined | null> {
  try {
    return await db.query.visitors.findFirst({
      where: eq(visitors.id, visitorId),
      with: {
        tickets: {
          orderBy: tickets.date,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching visitor", error);
    return null;
  }
}

/**
 * A returning visitor, found by the email they typed into the public
 * registration. Anyone can type any address there, so this returns only the
 * name printed on the tickets, the tickets themselves and the address the
 * caller already typed (matched exactly, so it is that same string) — never
 * the phone, birthdate or gender the visitor gave when registering.
 */
export async function fetchPublicVisitorByEmail(
  email: string,
): Promise<PublicVisitor | null> {
  try {
    const visitor = await db.query.visitors.findFirst({
      where: eq(visitors.email, email),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      with: {
        tickets: {
          orderBy: tickets.date,
        },
      },
    });
    return visitor ?? null;
  } catch (error) {
    console.error("Error fetching visitor by email", error);
    return null;
  }
}

/** Every visitor's address, for the registration-open announcement. */
export async function fetchVisitorsEmails() {
  try {
    return await db
      .select({
        id: visitors.id,
        email: visitors.email,
      })
      .from(visitors)
      .orderBy(asc(visitors.id));
  } catch (error) {
    console.error("Error fetching visitors", error);
    return [];
  }
}
