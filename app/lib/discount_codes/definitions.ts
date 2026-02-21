import { discountCodes, festivals, users } from "@/db/schema";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

export type DiscountCodeBase = InferSelectModel<typeof discountCodes>;
export type NewDiscountCode = InferInsertModel<typeof discountCodes>;
export type DiscountCodeWithRelations = DiscountCodeBase & {
  festival: InferSelectModel<typeof festivals> | null;
  user: InferSelectModel<typeof users> | null;
};
