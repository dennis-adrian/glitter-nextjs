import { discountCodes, users } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type DiscountCodeBase = InferSelectModel<typeof discountCodes>;
export type DiscountCodeAudience = DiscountCodeBase["audience"];

/** Enough of a person to name them in the list and the form. */
export type DiscountCodeUser = Pick<
  InferSelectModel<typeof users>,
  "id" | "displayName" | "firstName" | "lastName" | "email" | "imageUrl"
>;

export type DiscountCodeWithRelations = DiscountCodeBase & {
  festival: { id: number; name: string } | null;
  /** Who a `selected_users` code is reserved for; empty for `everyone`. */
  assignedUsers: DiscountCodeUser[];
};
