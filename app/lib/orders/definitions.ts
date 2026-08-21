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
import type { StoreCategory } from "@/app/lib/store/category";

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

/**
 * Admin list projection. The order stays complete for operational actions;
 * the extra fields describe it under the active category scope only.
 */
export type AdminOrderListRow = OrderWithRelations & {
  storeCategories: StoreCategory[];
  scopedSubtotal: number;
  isMixedCategory: boolean;
};

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
  /** Current catalog category, shown as a badge next to search results. */
  storeCategory: StoreCategory;
  requiresVariant: boolean;
  variants: AdminOrderAdjustmentVariant[];
};
