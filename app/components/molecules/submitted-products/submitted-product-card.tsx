"use client";

import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Label } from "@/app/components/ui/label";
import { formatDate } from "@/app/lib/formatters";
import { ParticipantProduct } from "@/app/lib/participant_products/definitions";
import { Loader2Icon, MessageSquareIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import {
	getStatusColor,
	getStatusIcon,
	getStatusText,
} from "@/app/components/molecules/submitted-products/utils";
import { deleteParticipantProduct } from "@/app/lib/participant_products/actions";
import { toast } from "sonner";
import { useState } from "react";

type SubmittedProductCardProps = {
	product: ParticipantProduct;
};

export default function SubmittedProductCard({
	product,
}: SubmittedProductCardProps) {
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDeleteProduct = async (product: ParticipantProduct) => {
		setIsDeleting(true);
		const result = await deleteParticipantProduct(product);
		if (result.success) {
			toast.success(result.message);
		} else {
			toast.error(result.message);
		}
		setIsDeleting(false);
	};

	return (
		<div className="border rounded-lg p-3 md:p-4">
			<div className="grid md:grid-cols-4 gap-4 relative">
				<div className="absolute top-1 right-1 z-10 md:bottom-0 md:top-auto">
					<Button
						size="sm"
						className="bg-red-500 hover:bg-red-600 focus:bg-red-600 text-white font-normal"
						onClick={() => handleDeleteProduct(product)}
						disabled={isDeleting}
					>
						<span>{isDeleting ? "Eliminando..." : "Eliminar"}</span>
						{isDeleting ? (
							<Loader2Icon className="w-4 h-4 ml-1 animate-spin" />
						) : (
							<Trash2Icon className="w-4 h-4 ml-1" />
						)}
					</Button>
				</div>
				{/* Image */}
				<div className="md:col-span-1">
					<Image
						src={product.imageUrl || "/placeholder.svg"}
						alt={product.name}
						width={200}
						height={200}
						className="w-full h-40 md:h-40 object-cover rounded-md"
					/>
				</div>

				{/* Product Info */}
				<div className="flex flex-col gap-1 md:gap-2 md:col-span-3">
					<div className="flex items-start justify-between gap-2">
						<div>
							<h3 className="font-semibold text-base md:text-lg">
								{product.name}
							</h3>
							<p className="text-xs text-gray-500">
								Guardado el{" "}
								{formatDate(product.createdAt).toFormat("dd/MM/yyyy HH:mm")}
							</p>
						</div>
						<Badge
							className={`${getStatusColor(product.submissionStatus)} flex items-center gap-1 text-xs`}
						>
							{getStatusIcon(product.submissionStatus)}
							{getStatusText(product.submissionStatus)}
						</Badge>
					</div>

					{product.description && (
						<p className="text-sm text-muted-foreground">
							{product.description}
						</p>
					)}
					{/* Observations Section */}
					{product.submissionFeedback && (
						<div className="flex flex-col gap-1 mt-2 md:mt-3 max-w-[340px]">
							<div className="flex items-center gap-1">
								<MessageSquareIcon className="w-4 h-4" />
								<Label className="text-sm font-medium">
									Observaciones del Equipo
								</Label>
							</div>
							<div
								className={`p-3 rounded-lg border ${getStatusColor(product.submissionStatus)}`}
							>
								<p className="text-sm">{product.submissionFeedback}</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
