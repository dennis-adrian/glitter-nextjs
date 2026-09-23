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
};

export type CollectionOption = { id: number; name: string };
