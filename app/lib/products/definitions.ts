import {
  productImages,
  productOptionValues,
  productOptions,
  products,
  productVariantOptionValues,
  productVariants,
} from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type BaseProduct = InferSelectModel<typeof products>;
export type BaseProductImage = InferSelectModel<typeof productImages>;
export type BaseProductOption = InferSelectModel<typeof productOptions>;
export type BaseProductOptionValue = InferSelectModel<
  typeof productOptionValues
>;
export type BaseProductVariant = InferSelectModel<typeof productVariants>;
export type BaseProductVariantOptionValue = InferSelectModel<
  typeof productVariantOptionValues
>;

export type ProductOptionWithValues = BaseProductOption & {
  values: BaseProductOptionValue[];
};

export type ProductVariantSelection = BaseProductVariantOptionValue & {
  option: BaseProductOption;
  optionValue: BaseProductOptionValue;
};

export type ProductVariantWithSelections = BaseProductVariant & {
  selections: ProductVariantSelection[];
};

export type BaseProductWithImages = BaseProduct & {
  images: BaseProductImage[];
  options?: ProductOptionWithValues[];
  variants?: ProductVariantWithSelections[];
};
