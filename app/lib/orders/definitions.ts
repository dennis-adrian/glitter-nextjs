import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { orderItems, orders } from "@/db/schema";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import {
	BaseProfile,
	ProfileSubcategoryWithSubcategory,
} from "@/app/api/users/definitions";

export type NewOrderItem = InferInsertModel<typeof orderItems>;

export type BaseOrder = InferSelectModel<typeof orders>;

export type BaseOrderItem = InferSelectModel<typeof orderItems>;

export type OrderItemWithRelations = BaseOrderItem & {
	product: BaseProductWithImages;
};

export type OrderWithRelations = BaseOrder & {
	orderItems: OrderItemWithRelations[];
	// null for guest orders (userId is null)
	customer:
		| (BaseProfile & {
				profileSubcategories: ProfileSubcategoryWithSubcategory[];
		  })
		| null;
};

export type OrderStatus = BaseOrder["status"];
