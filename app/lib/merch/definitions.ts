export type MerchCollection = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  campaignImageUrl?: string | null;
  campaignTextTone?: "dark" | "light";
  showInHero?: boolean;
  productIds: number[];
  /** Sellable bundles assigned to the collection. */
  bundleIds?: number[];
};

export type CollectionOption = { id: number; name: string };
