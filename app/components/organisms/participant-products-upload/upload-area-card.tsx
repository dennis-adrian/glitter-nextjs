import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { PlusIcon } from "lucide-react";

type UploadAreaCardProps = {
	handleImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	maxFileSize: number;
};

export default function UploadAreaCard({
	handleImageChange,
	maxFileSize,
}: UploadAreaCardProps) {
	return (
		<Card className="mb-5">
			<CardHeader className="p-4">
				<CardTitle className="text-base md:text-lg">
					Agregar Productos
				</CardTitle>
				<CardDescription>
					Sube una imagen por cada producto que ofrezcas en el festival.
				</CardDescription>
			</CardHeader>
			<CardContent className="p-4 pt-0">
				<div className="border-2 border-dashed border-gray-300 rounded-lg p-6 md:p-8 text-center hover:border-gray-400 transition-colors">
					<input
						id="images"
						type="file"
						accept="image/*"
						onChange={handleImageChange}
						className="hidden"
					/>
					<label htmlFor="images" className="cursor-pointer">
						<PlusIcon className="w-10 h-10 md:w-12 md:h-12 text-gray-400 mx-auto mb-4" />
						<p className="text-gray-600 mb-2 text-sm md:text-base">
							Toca para agregar imágenes de productos
						</p>
						<p className="text-xs md:text-sm text-gray-400">
							PNG, JPG, GIF hasta {maxFileSize / 1024 / 1024}MB cada una
						</p>
						<p className="text-xs text-gray-500 mt-1">
							Cada imagen será un producto individual
						</p>
					</label>
				</div>
			</CardContent>
		</Card>
	);
}
