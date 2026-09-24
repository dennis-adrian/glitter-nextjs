"use client";

import { TriangleAlertIcon } from "lucide-react";
import { DateTime } from "luxon";

import Heading from "@/app/components/atoms/heading";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDisplayDate } from "@/app/lib/formatters";

import type {
  CheckoutBundleItem,
  CheckoutLineItem,
} from "./checkout-line-item";

type CheckoutPresaleNoticeProps = {
  items: CheckoutLineItem[];
  bundles?: CheckoutBundleItem[];
};

function availabilityLabel(date: Date | null | undefined) {
  return date
    ? `disponible desde el ${formatDisplayDate(date, DateTime.DATE_FULL)}`
    : "disponible próximamente";
}

export function CheckoutPresaleNotice({
  items,
  bundles = [],
}: CheckoutPresaleNoticeProps) {
  const bundleComponents = bundles.flatMap((bundle) =>
    bundle.components
      .filter((component) => component.isPresale)
      .map((component, index) => ({
        key: `${String(bundle.key)}-${index}`,
        name: `${component.variantLabel ? `${component.productName} (${component.variantLabel})` : component.productName} · combo ${bundle.name}`,
        availableDate: component.presaleAvailableDate,
      })),
  );
  if (items.length === 0 && bundleComponents.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-6 space-y-3">
        <Heading level={4} className="flex items-center gap-2 text-amber-800">
          <TriangleAlertIcon className="h-4 w-4" />
          Productos en pre-venta
        </Heading>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key} className="text-sm text-amber-900">
              <span className="font-medium">
                {item.productVariantLabel
                  ? `${item.product.name} (${item.productVariantLabel})`
                  : item.product.name}
              </span>
              <span className="text-amber-700">
                {" "}
                -{" "}
                {item.product.availableDate
                  ? `disponible desde el ${formatDisplayDate(item.product.availableDate, DateTime.DATE_FULL)}`
                  : "disponible próximamente"}
              </span>
            </li>
          ))}
          {bundleComponents.map((component) => (
            <li key={component.key} className="text-sm text-amber-900">
              <span className="font-medium">{component.name}</span>
              <span className="text-amber-700">
                {" "}
                - {availabilityLabel(component.availableDate)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
