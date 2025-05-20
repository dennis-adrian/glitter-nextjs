import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { orderItems, orderStatusEnum, orders } from "@/db/schema";
import { BaseProduct } from "@/app/lib/products/definitions";
import {
	BaseProfile,
	ProfileSubcategoryWithSubcategory,
} from "@/app/api/users/definitions";

export type NewOrderItem = InferInsertModel<typeof orderItems>;

export type BaseOrder = InferSelectModel<typeof orders>;

export type BaseOrderItem = InferSelectModel<typeof orderItems>;

export type OrderItemWithRelations = BaseOrderItem & {
	product: BaseProduct;
};

export type OrderWithRelations = BaseOrder & {
	orderItems: OrderItemWithRelations[];
	customer: BaseProfile & {
		profileSubcategories: ProfileSubcategoryWithSubcategory[];
	};
};

export type OrderStatus = BaseOrder["status"];
