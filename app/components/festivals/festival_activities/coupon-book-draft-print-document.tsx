import CouponBookPrintPage from "@/app/components/festivals/festival_activities/coupon-book-print-page";
import {
  COUPON_BOOK_PAGE_HEIGHT_CM,
  COUPON_BOOK_PAGE_WIDTH_CM,
  CouponBookEntry,
  CouponTextLayoutConfig,
} from "@/app/lib/festival_activites/coupon-book-builder";
import {
  CouponBookDraft,
  CouponBookExportScope,
  draftEntryToCouponBookEntry,
  draftPageToCouponBookPage,
  getEffectiveLayoutForCoupon,
  listRenderableDraftSheets,
} from "@/app/lib/festival_activites/coupon-book-draft";
import { PdfCanvasConfig } from "@/app/lib/festival_activites/coupon-book-print-config";

type CouponBookDraftPrintDocumentProps = {
  draft: CouponBookDraft;
  pdfCanvas: PdfCanvasConfig;
  exportScope?: CouponBookExportScope;
};

export default function CouponBookDraftPrintDocument({
  draft,
  pdfCanvas,
  exportScope = { type: "all" },
}: CouponBookDraftPrintDocumentProps) {
  const sheets = listRenderableDraftSheets(draft, exportScope);

  const slotsPerRow = Math.max(
    1,
    Math.floor(pdfCanvas.widthCm / COUPON_BOOK_PAGE_WIDTH_CM),
  );
  const slotsPerColumn = Math.max(
    1,
    Math.floor(pdfCanvas.heightCm / COUPON_BOOK_PAGE_HEIGHT_CM),
  );
  const slotsPerSheet = slotsPerRow * slotsPerColumn;

  const packedSheets: Array<typeof sheets> = [];
  for (let index = 0; index < sheets.length; index += slotsPerSheet) {
    packedSheets.push(sheets.slice(index, index + slotsPerSheet));
  }

  return (
    <div data-couponbook-print-ready="true" style={{ margin: 0, padding: 0 }}>
      <style>{`
        @media print {
          @page { margin: 0; }
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
        }
        .couponbook-sheet {
          page-break-after: always;
          break-after: page;
        }
        .couponbook-sheet:last-child {
          page-break-after: auto;
          break-after: auto;
        }
      `}</style>

      {packedSheets.map((sheet, sheetIndex) => (
        <div
          key={`sheet-${sheetIndex}`}
          className="couponbook-sheet"
          style={{
            width: `${pdfCanvas.widthCm}cm`,
            height: `${pdfCanvas.heightCm}cm`,
            display: "grid",
            gridTemplateColumns: `repeat(${slotsPerRow}, ${COUPON_BOOK_PAGE_WIDTH_CM}cm)`,
            gridTemplateRows: `repeat(${slotsPerColumn}, ${COUPON_BOOK_PAGE_HEIGHT_CM}cm)`,
            justifyContent: "center",
            alignContent: "center",
            justifyItems: "start",
            alignItems: "start",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {sheet.map(({ book, page, courtesyEntry }) => {
            const couponBookPage = draftPageToCouponBookPage(draft, page);
            const headerDynamicCouponId = page.slotCouponIds[0] ?? null;
            const bodyCouponIds = page.slotCouponIds.slice(1);
            while (bodyCouponIds.length < couponBookPage.bodyEntries.length) {
              bodyCouponIds.push(null);
            }

            return (
              <CouponBookPrintPage
                key={`${book.id}-${page.id}`}
                page={couponBookPage}
                courtesyEntry={draftEntryToCouponBookEntry(courtesyEntry)}
                courtesyCouponId={draft.courtesyCouponId}
                headerDynamicCouponId={headerDynamicCouponId}
                bodyCouponIds={bodyCouponIds}
                textLayoutConfig={draft.globalSettings.globalLayout}
                resolveLayout={(couponId) =>
                  getEffectiveLayoutForCoupon(draft, couponId)
                }
                headerImageUrl={book.headerImageUrl}
                headerImageScalePct={
                  draft.globalSettings.globalLayout.headerImageScalePct
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function renderDraftBookPrintDocument(input: {
  draft: CouponBookDraft;
  pdfCanvas: PdfCanvasConfig;
  bookId: string;
}) {
  return (
    <CouponBookDraftPrintDocument
      draft={input.draft}
      pdfCanvas={input.pdfCanvas}
      exportScope={{ type: "book", bookId: input.bookId }}
    />
  );
}

export type CouponSlotLayoutContext = {
  courtesyEntry: CouponBookEntry;
  courtesyCouponId: string;
  headerDynamicCouponId: string | null;
  bodyCouponIds: (string | null)[];
  resolveLayout: (couponId: string | null) => CouponTextLayoutConfig;
};
