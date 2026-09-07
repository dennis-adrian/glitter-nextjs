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

export type PostAudience = "public" | "participants";

export const POST_AUDIENCE_LABELS: Record<PostAudience, string> = {
  public: "Todo el mundo",
  participants: "Solo participantes",
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
  | "id"
  | "title"
  | "slug"
  | "excerpt"
  | "coverImageUrl"
  | "publishedAt"
  | "audience"
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

export const COMMENT_MAX_LENGTH = 1000;
export const COMMENT_RATE_LIMIT = 5;
export const COMMENT_RATE_WINDOW_MS = 60_000;

export type CommentAuthor = {
  id: number;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
};

export type CommentReply = {
  id: number;
  body: string;
  createdAt: Date;
  userId: number;
  user: CommentAuthor;
};

export type CommentNode = CommentReply & {
  replies: CommentReply[];
};
