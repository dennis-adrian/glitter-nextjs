"use server";

import { NewTag, Tag } from "@/app/lib/tags/definitions";
import { db, pool } from "@/db";
import { tags } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function fetchTags(): Promise<Tag[]> {
  const client = await pool.connect();

  try {
    return await db.query.tags.findMany();
  } catch (error) {
    console.error("Error fetching tags", error);
    return [];
  } finally {
    client.release();
  }
}

export async function createTag(tag: NewTag) {
  const client = await pool.connect();

  try {
    await db.insert(tags).values(tag);
  } catch (error) {
    console.error("Error creating tag", error);
    return {
      success: false,
      message: "Error al crear la etiqueta",
    };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/tags");
  return {
    success: true,
    message: "Etiqueta creada correctamente",
  };
}
