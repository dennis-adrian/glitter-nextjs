"use server";

import { pool, db } from "@/db";
import { visitors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TicketBase } from "../tickets/actions";

export type NewVisitor = typeof visitors.$inferInsert;
export type VisitorBase = typeof visitors.$inferSelect;
export type VisitorWithTickets = VisitorBase & {
  tickets: TicketBase[];
};

export async function fetchVisitorByEmail(
  email: string,
): Promise<VisitorWithTickets | undefined | null> {
  const client = await pool.connect();
  try {
    return await db.query.visitors.findFirst({
      where: eq(visitors.email, email),
      with: {
        tickets: true,
      },
    });
  } catch (error) {
    console.error("Error fetching visitor by email", error);
    return null;
  } finally {
    client.release();
  }
}
