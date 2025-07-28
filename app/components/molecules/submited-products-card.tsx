import { Badge } from "@/app/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { formatDate } from "@/app/lib/formatters";
import { fetchParticipantProducts } from "@/app/lib/participant_products/actions";
import {
	AlertCircleIcon,
	CheckCircleIcon,
	ClockIcon,
	MessageSquareIcon,
} from "lucide-react";
import Image from "next/image";

type SubmitedProductsCardProps = {
	profileId: number;
	festivalId: number;
};
export default async function SubmitedProductsCard({
	profileId,
	festivalId,
}: SubmitedProductsCardProps) {
	const submittedProducts = await fetchParticipantProducts(
		profileId,
		festivalId,
	);

	if (submittedProducts.length === 0) return null;

	return (
		<Card>
			<CardHeader className="p-4">
				<CardTitle className="text-base md:text-lg">
					Productos Guardados
				</CardTitle>
				<CardDescription>
					Rastrea el estado de tus productos guardados
				</CardDescription>
			</CardHeader>
			<CardContent className="p-4 pt-0">
				<div className="flex flex-col gap-2 md:gap-4">
					{submittedProducts.map((product) => (
						<div key={product.id} className="border rounded-lg p-3 md:p-4">
							<div className="grid md:grid-cols-4 gap-4">
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
												{formatDate(product.createdAt).toFormat(
													"dd/MM/yyyy HH:mm",
												)}
											</p>
										</div>
										<Badge
											className={`${getStatusColor(product.submitionStatus)} flex items-center gap-1 text-xs`}
										>
											{getStatusIcon(product.submitionStatus)}
											{getStatusText(product.submitionStatus)}
										</Badge>
									</div>

									{product.description && (
										<p className="text-sm text-muted-foreground">
											{product.description}
										</p>
									)}
									{/* Observations Section */}
									{product.submitionFeedback && (
										<div className="flex flex-col gap-1 mt-2 md:mt-3">
											<div className="flex items-center gap-1">
												<MessageSquareIcon className="w-4 h-4" />
												<Label className="text-sm font-medium">
													Observaciones del Equipo
												</Label>
											</div>
											<div
												className={`p-3 rounded-lg border ${getStatusColor(product.submitionStatus)}`}
											>
												<p className="text-sm">{product.submitionFeedback}</p>
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

const getStatusIcon = (status: string) => {
	switch (status) {
		case "approved":
			return <CheckCircleIcon className="w-4 h-4 text-green-800" />;
		case "rejected":
			return <AlertCircleIcon className="w-4 h-4 text-red-800" />;
		default:
			return <ClockIcon className="w-4 h-4 text-amber-800" />;
	}
};

const getStatusColor = (status: string) => {
	switch (status) {
		case "approved":
			return "bg-green-50 text-green-800 border border-green-200";
		case "rejected":
			return "bg-red-50 text-red-800 border border-red-200";
		default:
			return "bg-amber-50 text-amber-800 border border-amber-200";
	}
};

const getStatusText = (status: string) => {
	switch (status) {
		case "approved":
			return "Aprobado";
		case "rejected":
			return "Rechazado";
		default:
			return "En revisión";
	}
};
