import { z } from "zod";

import { COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE } from "@/app/lib/festival_activites/coupon-book-builder";

const COUPON_BOOK_DRAFT_SCHEMA_VERSION = 2;
const MAX_DYNAMIC_COUPONS_PER_PAGE = COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE;

const CouponTextBoxConfigSchema = z.object({
  xPct: z.number(),
  yPct: z.number(),
  widthPct: z.number(),
  heightPct: z.number(),
  multiline: z.boolean(),
});

const CouponTextLayoutConfigSchema = z.object({
  leftColumnWidthPct: z.number(),
  standFontSizeMm: z.number(),
  sectorFontSizeMm: z.number(),
  headerImageScalePct: z.number(),
  nameBox: CouponTextBoxConfigSchema,
  highlightBox: CouponTextBoxConfigSchema,
  descriptionBox: CouponTextBoxConfigSchema,
  validityBox: CouponTextBoxConfigSchema,
});

const PdfCanvasConfigSchema = z.object({
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  orientation: z.enum(["portrait", "landscape"]),
});

const CouponLayoutOverrideSchema = z
  .object({
    leftColumnWidthPct: z.number().optional(),
    standFontSizeMm: z.number().optional(),
    sectorFontSizeMm: z.number().optional(),
    nameBox: CouponTextBoxConfigSchema.partial().optional(),
    highlightBox: CouponTextBoxConfigSchema.partial().optional(),
    descriptionBox: CouponTextBoxConfigSchema.partial().optional(),
    validityBox: CouponTextBoxConfigSchema.partial().optional(),
  })
  .strict()
  .optional()
  .nullable();

const DraftCouponEntrySnapshotSchema = z.object({
  participationId: z.number().nullable(),
  participantName: z.string(),
  standLabels: z.array(z.string()),
  sectorName: z.string().nullable(),
  promoHighlight: z.string(),
  promoDescription: z.string(),
  promoConditions: z.string().nullable(),
  imageUrl: z.string().nullable(),
  proofStatus: z.enum(["approved", "pending_review"]),
});

const DraftCouponEntrySharedSchema = {
  id: z.string().min(1),
  participantName: z.string(),
  standLabels: z.array(z.string()),
  sectorName: z.string().nullable(),
  promoHighlight: z.string(),
  promoDescription: z.string(),
  promoConditions: z.string().nullable(),
  imageUrl: z.string().nullable(),
  proofStatus: z.enum(["approved", "pending_review"]),
  layoutOverride: CouponLayoutOverrideSchema,
  sourceSnapshot: DraftCouponEntrySnapshotSchema.optional(),
} as const;

const DraftCouponEntrySchema = z.discriminatedUnion("type", [
  z.object({
    ...DraftCouponEntrySharedSchema,
    type: z.literal("courtesy"),
    participationId: z.null(),
  }),
  z.object({
    ...DraftCouponEntrySharedSchema,
    type: z.literal("participant"),
    participationId: z.number(),
  }),
]);

const DraftCouponPageSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  pageNumber: z.number().int().positive(),
  slotCouponIds: z
    .array(z.string().min(1).nullable())
    .min(1)
    .max(MAX_DYNAMIC_COUPONS_PER_PAGE),
});

const DraftCouponBookSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  sourceDetailId: z.number().int().positive(),
  headerImageUrl: z.string().nullable(),
  variantCouponCount: z.number().int().positive(),
  pageIds: z.array(z.string().min(1)).min(1),
});

const CouponBookDraftGlobalSettingsSchema = z.object({
  pdfCanvas: PdfCanvasConfigSchema,
  dynamicCouponsPerPage: z
    .number()
    .int()
    .min(1)
    .max(MAX_DYNAMIC_COUPONS_PER_PAGE),
  participantInclusionMode: z.enum(["approved_only", "approved_and_pending"]),
  globalLayout: CouponTextLayoutConfigSchema,
});

export const CouponBookDraftSchema = z
  .object({
    festivalId: z.number().int().positive(),
    activityId: z.number().int().positive(),
    schemaVersion: z.literal(COUPON_BOOK_DRAFT_SCHEMA_VERSION),
    updatedAt: z.string().min(1),
    savedRevision: z.number().int().positive().nullable().optional(),
    globalSettings: CouponBookDraftGlobalSettingsSchema,
    courtesyCouponId: z.string().min(1),
    entries: z.record(z.string(), DraftCouponEntrySchema),
    books: z.array(DraftCouponBookSchema).min(1),
    pages: z.record(z.string(), DraftCouponPageSchema),
  })
  .superRefine((draft, ctx) => {
    for (const [key, entry] of Object.entries(draft.entries)) {
      if (key !== entry.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Entry key "${key}" does not match entry id "${entry.id}"`,
          path: ["entries", key, "id"],
        });
      }
    }

    for (const [key, page] of Object.entries(draft.pages)) {
      if (key !== page.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Page key "${key}" does not match page id "${page.id}"`,
          path: ["pages", key, "id"],
        });
      }
    }

    const courtesy = draft.entries[draft.courtesyCouponId];
    if (!courtesy || courtesy.type !== "courtesy") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing courtesy coupon entry",
        path: ["courtesyCouponId"],
      });
    }

    for (const book of draft.books) {
      for (const pageId of book.pageIds) {
        const page = draft.pages[pageId];
        if (!page) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown page id ${pageId}`,
            path: ["books"],
          });
          continue;
        }
        if (page.bookId !== book.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Page ${pageId} does not belong to book ${book.id}`,
            path: ["pages", pageId, "bookId"],
          });
        }
      }
    }

    const perPage = draft.globalSettings.dynamicCouponsPerPage;

    for (const page of Object.values(draft.pages)) {
      if (page.slotCouponIds.length > perPage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Page ${page.id} exceeds ${perPage} slot entries`,
          path: ["pages", page.id, "slotCouponIds"],
        });
      }

      for (const couponId of page.slotCouponIds) {
        if (!couponId) continue;
        const entry = draft.entries[couponId];
        if (!entry) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown coupon id ${couponId} on page ${page.id}`,
            path: ["pages", page.id, "slotCouponIds"],
          });
        } else if (entry.type !== "participant") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Courtesy coupon cannot occupy a page slot`,
            path: ["pages", page.id, "slotCouponIds"],
          });
        }
      }
    }
  });

export type ParsedCouponBookDraft = z.infer<typeof CouponBookDraftSchema>;

export function parseCouponBookDraft(
  value: unknown,
): ParsedCouponBookDraft | null {
  const result = CouponBookDraftSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseCouponTextLayoutConfig(
  value: unknown,
): z.infer<typeof CouponTextLayoutConfigSchema> | null {
  const result = CouponTextLayoutConfigSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parsePdfCanvasConfig(
  value: unknown,
): z.infer<typeof PdfCanvasConfigSchema> | null {
  const result = PdfCanvasConfigSchema.safeParse(value);
  return result.success ? result.data : null;
}
