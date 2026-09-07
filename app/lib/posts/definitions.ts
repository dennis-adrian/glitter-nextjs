import type { InferSelectModel } from "drizzle-orm";

import type { postCategories, postTags, posts, users } from "@/db/schema";

export type PostStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "archived";

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Borrador",
  submitted: "En revisión",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
  rejected: "Rechazado",
  archived: "Archivado",
};

export type PostRow = InferSelectModel<typeof posts>;
export type PostInsert = typeof posts.$inferInsert;
export type PostCategoryRow = InferSelectModel<typeof postCategories>;
export type PostTagRow = InferSelectModel<typeof postTags>;

export type PostAuthor = Pick<
  InferSelectModel<typeof users>,
  "id" | "displayName" | "firstName" | "lastName" | "imageUrl"
>;

export type PostWithRelations = PostRow & {
  /** Null once the author deletes their account; see posts/anonymization.ts. */
  author: PostAuthor | null;
  reviewer: PostAuthor | null;
  categories: PostCategoryRow[];
  tags: PostTagRow[];
};

export type PublicPostListItem = Pick<
  PostRow,
  "id" | "title" | "slug" | "excerpt" | "coverImageUrl" | "publishedAt"
> & {
  /** Null once the author deletes their account; see posts/anonymization.ts. */
  author: PostAuthor | null;
  categories: PostCategoryRow[];
  tags: PostTagRow[];
};

export type PostFormValues = {
  title: string;
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
  content: unknown;
  seoTitle?: string;
  seoDescription?: string;
  categoryIds: number[];
  tagInputs: string[];
};
