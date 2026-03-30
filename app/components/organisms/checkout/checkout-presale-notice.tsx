"use client";

import { TriangleAlertIcon } from "lucide-react";
import { DateTime } from "luxon";

import Heading from "@/app/components/atoms/heading";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";

import type { CheckoutLineItem } from "./checkout-line-item";

type CheckoutPresaleNoticeProps = {
	items: CheckoutLineItem[];
};

export function CheckoutPresaleNotice({ items }: CheckoutPresaleNoticeProps) {
	if (items.length === 0) return null;

	return (
		<Card className="border-amber-200 bg-amber-50">
			<CardContent className="p-6 space-y-3">
				<Heading
					level={4}
					className="flex items-center gap-2 text-amber-800"
				>
					<TriangleAlertIcon className="h-4 w-4" />
					Productos en pre-venta
				</Heading>
				<ul className="space-y-1">
					{items.map((item) => (
						<li key={item.key} className="text-sm text-amber-900">
							<span className="font-medium">{item.product.name}</span>
							{item.product.availableDate && (
								<span className="text-amber-700">
									{" "}
									- disponible desde el{" "}
									{formatDate(item.product.availableDate).toLocaleString(
										DateTime.DATE_FULL,
									)}
								</span>
							)}
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
