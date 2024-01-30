"use server";

import { desc, eq } from "drizzle-orm";

import { pool, db } from "@/db";
import { festivals } from "@/db/schema";

export type Festival = typeof festivals.$inferSelect;
export async function fetchActiveFestival() {
  const client = await pool.connect();

  try {
    const result: Festival[] = await db
      .select()
      .from(festivals)
      .where(eq(festivals.status, "active"))
      .orderBy(desc(festivals.endDate));

    return result[0];
  } catch (error) {
    return {
      message: "Error fetching active festival",
      error,
    };
  } finally {
    client.release();
  }
}
