import { productImages, products } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type BaseProduct = InferSelectModel<typeof products>;
export type BaseProductImage = InferSelectModel<typeof productImages>;
export type BaseProductWithImages = BaseProduct & {
	images: BaseProductImage[];
};
