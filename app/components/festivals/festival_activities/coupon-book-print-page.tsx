import CouponBookCardPrint from "@/app/components/festivals/festival_activities/coupon-book-card-print";
import {
  COUPON_BOOK_PAGE_HEIGHT_CM,
  COUPON_BOOK_PAGE_WIDTH_CM,
  computeCouponBookGridLayout,
  COURTESY_COUPON_ENTRY,
  CouponBookEntry,
  CouponBookPage,
  CouponTextLayoutConfig,
  DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
} from "@/app/lib/festival_activites/coupon-book-builder";
import type { CSSProperties } from "react";

type CouponBookPrintPageProps = {
  page: CouponBookPage;
  textLayoutConfig?: CouponTextLayoutConfig;
  courtesyEntry?: CouponBookEntry;
  courtesyCouponId?: string;
  headerDynamicCouponId?: string | null;
  bodyCouponIds?: (string | null)[];
  resolveLayout?: (couponId: string | null) => CouponTextLayoutConfig;
  headerImageUrl?: string | null;
  headerImageScalePct?: number;
  selectedCouponId?: string | null;
  onSelectCoupon?: (couponId: string) => void;
};

function layoutForSlot(
  couponId: string | null | undefined,
  fallback: CouponTextLayoutConfig,
  resolveLayout?: (couponId: string | null) => CouponTextLayoutConfig,
): CouponTextLayoutConfig {
  if (!resolveLayout) return fallback;
  return resolveLayout(couponId ?? null);
}

function slotShellStyle(input: {
  selected: boolean;
  onClick?: () => void;
}): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 0,
    zIndex: 1,
    cursor: input.onClick ? "pointer" : undefined,
    outline: input.selected ? "2px solid #2563eb" : undefined,
    outlineOffset: input.selected ? "-2px" : undefined,
  };
}

export default function CouponBookPrintPage({
  page,
  textLayoutConfig = DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
  courtesyEntry,
  courtesyCouponId,
  headerDynamicCouponId,
  bodyCouponIds,
  resolveLayout,
  headerImageUrl = null,
  headerImageScalePct = DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.headerImageScalePct,
  selectedCouponId = null,
  onSelectCoupon,
}: CouponBookPrintPageProps) {
  const resolvedCourtesy = courtesyEntry ?? COURTESY_COUPON_ENTRY;
  const dynamicSlotCount =
    page.dynamicSlotCount ?? 1 + page.bodyEntries.length;
  const { totalRows, bodyRows } = computeCouponBookGridLayout(dynamicSlotCount);
  const lastBodyRow = bodyRows === 0 ? 1 : 1 + bodyRows;

  return (
    <div
      style={{
        position: "relative",
        width: `${COUPON_BOOK_PAGE_WIDTH_CM}cm`,
        height: `${COUPON_BOOK_PAGE_HEIGHT_CM}cm`,
        background: "white",
        overflow: "hidden",
        boxSizing: "border-box",
        border: "1px solid #111",
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
        fontFamily: "Arial, Helvetica, sans-serif",
        isolation: "isolate",
      }}
    >
      <div
        style={{
          gridColumn: "1 / span 3",
          gridRow: "1",
          borderRight: "2px solid #111",
          borderBottom: "2px dashed #111",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
        }}
      >
        {headerImageUrl ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fff",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={headerImageUrl}
              alt="Header de cuponera"
              style={{
                width: `${headerImageScalePct}%`,
                height: `${headerImageScalePct}%`,
                objectFit: "contain",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              padding: "3.5mm 3mm",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "2mm",
            }}
          >
            <div
              style={{
                width: "12mm",
                height: "12mm",
                background: "#f0e4d6",
                borderRadius: "2px",
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: "10mm",
                fontWeight: 900,
                color: "#d0021b",
              }}
            >
              Glitter
            </p>
            <div
              style={{
                width: "11mm",
                height: "11mm",
                background:
                  "repeating-linear-gradient(45deg, #000 0, #000 1px, #fff 1px, #fff 2px)",
              }}
            />
          </div>
        )}
      </div>

      <div
        style={{
          gridColumn: "4",
          gridRow: "1",
          padding: "1.2mm",
          borderBottom: "2px dashed #111",
          borderRight: "2px solid #111",
          ...slotShellStyle({
            selected: selectedCouponId === courtesyCouponId,
            onClick: courtesyCouponId ? () => onSelectCoupon?.(courtesyCouponId) : undefined,
          }),
        }}
        onClick={
          courtesyCouponId
            ? () => onSelectCoupon?.(courtesyCouponId)
            : undefined
        }
        onKeyDown={
          courtesyCouponId
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectCoupon?.(courtesyCouponId);
                }
              }
            : undefined
        }
        role={courtesyCouponId ? "button" : undefined}
        tabIndex={courtesyCouponId ? 0 : undefined}
      >
        {resolvedCourtesy ? (
          <CouponBookCardPrint
            entry={resolvedCourtesy}
            textLayoutConfig={layoutForSlot(
              courtesyCouponId ?? null,
              textLayoutConfig,
              resolveLayout,
            )}
          />
        ) : null}
      </div>

      <div
        style={{
          gridColumn: "5",
          gridRow: "1",
          padding: "1.2mm",
          borderBottom: "2px dashed #111",
          ...slotShellStyle({
            selected: selectedCouponId === headerDynamicCouponId,
            onClick: headerDynamicCouponId
              ? () => onSelectCoupon?.(headerDynamicCouponId)
              : undefined,
          }),
        }}
        onClick={
          headerDynamicCouponId
            ? () => onSelectCoupon?.(headerDynamicCouponId)
            : undefined
        }
        onKeyDown={
          headerDynamicCouponId
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectCoupon?.(headerDynamicCouponId);
                }
              }
            : undefined
        }
        role={headerDynamicCouponId ? "button" : undefined}
        tabIndex={headerDynamicCouponId ? 0 : undefined}
      >
        {page.headerDynamicEntry ? (
          <CouponBookCardPrint
            entry={page.headerDynamicEntry}
            textLayoutConfig={layoutForSlot(
              headerDynamicCouponId ?? null,
              textLayoutConfig,
              resolveLayout,
            )}
          />
        ) : null}
      </div>

      {page.bodyEntries.map((entry, index) => {
        const row = Math.floor(index / 5) + 2;
        const col = (index % 5) + 1;
        const couponId = bodyCouponIds?.[index] ?? null;
        return (
          <div
            key={`body-slot-${index}`}
            style={{
              gridRow: row,
              gridColumn: col,
              padding: "1.2mm",
              borderBottom: row < lastBodyRow ? "2px dashed #111" : undefined,
              borderRight: col < 5 ? "2px dashed #111" : undefined,
              ...slotShellStyle({
                selected: couponId !== null && selectedCouponId === couponId,
                onClick: couponId ? () => onSelectCoupon?.(couponId) : undefined,
              }),
            }}
            onClick={couponId ? () => onSelectCoupon?.(couponId) : undefined}
            onKeyDown={
              couponId
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectCoupon?.(couponId);
                    }
                  }
                : undefined
            }
            role={couponId ? "button" : undefined}
            tabIndex={couponId ? 0 : undefined}
          >
            {entry ? (
              <CouponBookCardPrint
                entry={entry}
                textLayoutConfig={layoutForSlot(
                  couponId,
                  textLayoutConfig,
                  resolveLayout,
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
