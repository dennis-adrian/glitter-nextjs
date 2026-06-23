import type {
  productContentSectionDisplayContextEnum,
  productContentSectionFormatEnum,
  productRentalStockModeEnum,
  productTransactionTypeEnum,
  rentalReturnConditionEnum,
} from "@/db/schema";

export type ProductTransactionType =
  (typeof productTransactionTypeEnum.enumValues)[number];
export type ProductRentalStockMode =
  (typeof productRentalStockModeEnum.enumValues)[number];
export type ProductContentSectionFormat =
  (typeof productContentSectionFormatEnum.enumValues)[number];
export type ProductContentSectionDisplayContext =
  (typeof productContentSectionDisplayContextEnum.enumValues)[number];
export type RentalReturnCondition =
  (typeof rentalReturnConditionEnum.enumValues)[number];

export type RentalStatus =
  | "not_applicable"
  | "out"
  | "partially_returned"
  | "returned";

export type RentalContentSectionSnapshot = {
  title: string;
  format: ProductContentSectionFormat;
  body: string | null;
  items: string[] | null;
  displayContext: ProductContentSectionDisplayContext;
  sortOrder: number;
};

export type RentalEligibilityContext = {
  festivalId: number;
  festivalName: string;
  festivalStartDate: Date | null;
  reservationId: number;
  standId: number;
  standLabel: string | null;
  standNumber: number;
  reservationIds: number[];
  stands: {
    reservationId: number;
    standId: number;
    standLabel: string | null;
    standNumber: number;
  }[];
};

export type RentalEligibilityResult =
  | {
      eligible: true;
      userId: number;
      contexts: RentalEligibilityContext[];
    }
  | {
      eligible: false;
      error:
        | "guest_not_allowed"
        | "not_verified"
        | "not_active_participant"
        | "no_active_festival"
        | "invalid_rental_context";
      message: string;
    };

export type MarkRentalReturnResult =
  | {
      success: true;
      returnedQuantity: number;
      outstandingQuantity: number;
      stockRestored: number;
    }
  | {
      success: false;
      error:
        | "not_found"
        | "forbidden"
        | "not_rental"
        | "invalid_quantity"
        | "already_returned"
        | "stock_update_failed"
        | "notes_required";
      message: string;
    };

export type ProductContentSectionInput = {
  id?: number;
  productVariantId?: number | null;
  title: string;
  format: ProductContentSectionFormat;
  body?: string | null;
  items?: string[] | null;
  displayContext: ProductContentSectionDisplayContext;
  isVisible?: boolean;
  sortOrder?: number;
};

export type ProductRentalSettingsInput = {
  isPurchasable: boolean;
  isRentable: boolean;
  rentalPrice?: number | null;
  rentalStockMode?: ProductRentalStockMode;
  rentalStock?: number | null;
};
