"use client";

import type { ReactNode } from "react";

import type {
  CheckoutBundleItem,
  CheckoutLineItem,
} from "./checkout-line-item";
import { CheckoutOrderSummary } from "./checkout-order-summary";
import { CheckoutPageHeader } from "./checkout-page-header";
import { CheckoutPresaleNotice } from "./checkout-presale-notice";

type CheckoutPageLayoutProps = {
  orderSummaryItems: CheckoutLineItem[];
  bundleItems?: CheckoutBundleItem[];
  total: number;
  presaleItems: CheckoutLineItem[];
  children: ReactNode;
};

export function CheckoutPageLayout({
  orderSummaryItems,
  bundleItems = [],
  total,
  presaleItems,
  children,
}: CheckoutPageLayoutProps) {
  return (
    <div className="container p-3 pb-28 md:p-6 md:pb-6">
      <CheckoutPageHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mx-auto">
        <CheckoutOrderSummary
          items={orderSummaryItems}
          bundles={bundleItems}
          total={total}
        />
        <div className="flex flex-col gap-3 md:gap-6">
          <CheckoutPresaleNotice items={presaleItems} bundles={bundleItems} />
          {children}
        </div>
      </div>
    </div>
  );
}
