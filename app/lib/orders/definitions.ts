import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { orderItems, orders } from "@/db/schema";
import {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import {
  BaseProfile,
  ProfileSubcategoryWithSubcategory,
} from "@/app/api/users/definitions";

export type NewOrderItem = InferInsertModel<typeof orderItems>;

export type BaseOrder = InferSelectModel<typeof orders>;

export type BaseOrderItem = InferSelectModel<typeof orderItems>;

export type OrderItemWithRelations = BaseOrderItem & {
  product: BaseProductWithImages;
  variant: ProductVariantWithSelections | null;
  /** Present when this effective line originated from an additive adjustment. */
  adjustmentItemId?: number | null;
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

export type AdminOrderAdjustmentVariant = {
  id: number;
  label: string;
  price: number;
  stock: number;
};

export type AdminOrderAdjustmentProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
  requiresVariant: boolean;
  variants: AdminOrderAdjustmentVariant[];
};
