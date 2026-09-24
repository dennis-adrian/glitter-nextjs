import type {
  BaseProduct,
  BaseProductWithImages,
} from "@/app/lib/products/definitions";

/** A component as stored: which product, how many units and which variants. */
export type BundleComponentRecord = {
  id: number;
  productId: number;
  quantity: number;
  sortOrder: number;
  /** Eligible variants. One fixes the variant; several let the customer pick. */
  variantIds: number[];
};

export type BundleRecord = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  /** Fixed bundle price in Bs. */
  price: number;
  isVisible: boolean;
  sortOrder: number;
  version: number;
  components: BundleComponentRecord[];
  collectionIds: number[];
};

/** Catalog product as the bundle evaluator needs it (variants with labels). */
export type BundleCatalogProduct = BaseProductWithImages;

export type BundleVariantChoice = "none" | "fixed" | "choice";

export type BundleComponentOption = {
  /** Null for products without variants. */
  variantId: number | null;
  label: string | null;
  /** Current individual selling price, including product discounts. */
  unitPriceCents: number;
  stock: number;
  imageUrl: string | null;
};

export type EvaluatedBundleComponent = {
  componentId: number;
  productId: number;
  productName: string;
  productSlug: string;
  productStatus: BaseProduct["status"];
  productAvailableDate: Date | null;
  imageUrl: string | null;
  quantity: number;
  choice: BundleVariantChoice;
  /** Currently purchasable options (visible eligible variants). */
  options: BundleComponentOption[];
};

export type BundleIssueCode =
  | "too_few_products"
  | "product_missing"
  | "product_not_merch"
  | "product_not_purchasable"
  | "product_hidden"
  | "variant_required"
  | "variant_unavailable"
  | "variant_price_mismatch"
  | "price_invalid"
  | "not_discounted";

export type BundleIssue = {
  code: BundleIssueCode;
  message: string;
  componentId?: number;
};

export type BundleEvaluation = {
  priceCents: number;
  /** Cheapest and dearest separate purchase of one bundle's contents. */
  separateMinCents: number | null;
  separateMaxCents: number | null;
  components: EvaluatedBundleComponent[];
  /** Any issue makes the bundle unpublishable and unsellable. */
  issues: BundleIssue[];
};

/** The customer's variant choice for one component. */
export type BundleSelectionInput = {
  componentId: number;
  productVariantId: number;
};

/** A component with its concrete variant, as sold. */
export type ResolvedBundleComponent = {
  componentId: number;
  productId: number;
  productName: string;
  productVariantId: number | null;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  stock: number;
  imageUrl: string | null;
  productStatus: BaseProduct["status"];
  productAvailableDate: Date | null;
};

/** Public storefront view of a sellable bundle. */
export type PublicBundle = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  version: number;
  sortOrder: number;
  collectionIds: number[];
  priceCents: number;
  separateMinCents: number;
  separateMaxCents: number;
  components: EvaluatedBundleComponent[];
  /** At least one combination can be bought right now. */
  inStock: boolean;
};

export type BundleLineIssue =
  | "unavailable"
  | "stale"
  | "selection_invalid"
  | "stock_insufficient"
  | "out_of_stock";

/** A bundle line in a cart, resolved against the current catalog. */
export type CartBundleLine = {
  /** Cart bundle id for authenticated carts; the local line key for guests. */
  key: string;
  cartBundleId: number | null;
  bundleId: number;
  bundleVersion: number;
  currentVersion: number | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  selections: BundleSelectionInput[];
  unitPriceCents: number;
  separateUnitPriceCents: number;
  components: ResolvedBundleComponent[];
  /** Highest quantity the current stock allows, given the rest of the cart. */
  maxQuantity: number;
  issue: BundleLineIssue | null;
  message: string | null;
};
