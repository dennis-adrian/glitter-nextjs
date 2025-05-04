"use server";

import { asc, desc, eq } from "drizzle-orm";

import { TicketBase } from "@/app/data/tickets/actions";
import { db } from "@/db";
import { tickets, visitors } from "@/db/schema";
import { revalidatePath } from "next/cache";

export type NewVisitor = typeof visitors.$inferInsert;
export type VisitorBase = typeof visitors.$inferSelect;
export type VisitorWithTickets = VisitorBase & {
	tickets: TicketBase[];
};

export async function fetchVisitorByEmail(
	email: string,
): Promise<VisitorWithTickets | undefined | null> {
	try {
		return await db.query.visitors.findFirst({
			where: eq(visitors.email, email),
			with: {
				tickets: {
					orderBy: tickets.date,
				},
			},
		});
	} catch (error) {
		console.error("Error fetching visitor by email", error);
		return null;
	}
}

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

export async function createVisitor(visitor: NewVisitor) {
	let createdVisitor = null;
	try {
		const [newVisitor] = await db.insert(visitors).values(visitor).returning();
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

export async function fetchVisitorsEmails() {
	try {
		return db
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

export async function fetchVisitors() {
	try {
		return await db.query.visitors.findMany({
			orderBy: desc(visitors.id),
		});
	} catch (error) {
		console.error("Error fetching visitors", error);
		return [] as VisitorBase[];
	}
}
