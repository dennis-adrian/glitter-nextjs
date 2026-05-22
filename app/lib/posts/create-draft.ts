import "server-only";

import type { BaseProfile } from "@/app/api/users/definitions";
import { ensureUniquePostSlug } from "@/app/lib/posts/slug";
import { db } from "@/db";
import { posts } from "@/db/schema";

const EMPTY_DOC = [{ type: "paragraph", content: [] }];

export async function createBlankDraft(
	profile: Pick<BaseProfile, "id">,
): Promise<{ id: number; slug: string }> {
	return db.transaction(async (tx) => {
		const slug = await ensureUniquePostSlug(tx, "borrador");
		const [row] = await tx
			.insert(posts)
			.values({
				title: "",
				slug,
				content: EMPTY_DOC,
				contentHtml: "",
				authorId: profile.id,
				status: "draft",
			})
			.returning({ id: posts.id, slug: posts.slug });
		if (!row) throw new Error("No se pudo crear el borrador");
		return row;
	});
}
