"use client";

import { useState } from "react";
import Image from "next/image";
import { ReceiptIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";

type Props = {
	voucherUrl: string;
	orderId: number;
};

export default function OrderVoucherDialog({ voucherUrl, orderId }: Props) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					title="Ver comprobante de pago"
				>
					<ReceiptIcon className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Comprobante — Orden #{orderId}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col items-center gap-4">
					<Image
						src={voucherUrl}
						alt={`Comprobante de pago orden #${orderId}`}
						width={320}
						height={420}
						className="rounded-md border object-contain max-h-[420px] w-auto"
					/>
					<a
						href={voucherUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
					>
						<ExternalLinkIcon className="h-3 w-3" />
						Abrir en pantalla completa
					</a>
				</div>
			</DialogContent>
		</Dialog>
	);
}
