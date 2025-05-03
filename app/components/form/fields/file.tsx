"use client";

import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { UploadButton } from "@/app/vendors/uploadthing";
import { UseFormReturn } from "react-hook-form";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import type { UploadthingComponentProps } from "@uploadthing/react";
import type { Json } from "@uploadthing/shared";
import { Button } from "@/app/components/ui/button";
import { deleteFile } from "@/app/lib/uploadthing/actions";

// TODO: Mejorar la interfaz del componente
// Permitir que se suban varios archivos, que se pueda elegir el endpoint y manejar previews
export default function FileInput({
	formControl,
	label,
	name,
	messagePosition = "bottom",
	description,
	endpoint = "imageUploader",
	onUploading,
}: {
	formControl: UseFormReturn<any>["control"];
	label?: string;
	messagePosition?: "top" | "bottom";
	name: string;
	description?: string;
	endpoint?: UploadthingComponentProps<
		OurFileRouter,
		"imageUploader"
	>["endpoint"];
	onUploading?: (isUploading: boolean) => void;
}) {
	return (
		<FormField
			control={formControl}
			name={name}
			render={({ field }) => (
				<FormItem className="w-full grid gap-2">
					{label && <FormLabel>{label}</FormLabel>}
					{messagePosition === "top" && <FormMessage />}
					<FormControl>
						<div className="flex flex-col gap-2">
							{field.value && (
								<div className="flex items-center gap-2 p-2 border rounded-md">
									<p className="text-sm truncate flex-1">{field.value}</p>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={async () => {
											try {
												const result = await deleteFile(field.value);
												if (result.success) {
													field.onChange("");
													toast.success("Archivo eliminado correctamente");
												} else {
													toast.error(
														result.error || "Error al eliminar el archivo",
													);
												}
											} catch (error) {
												console.error("Error deleting file", error);
												toast.error("Error al eliminar el archivo");
											}
										}}
									>
										<Trash2Icon className="h-4 w-4" />
									</Button>
								</div>
							)}
							<UploadButton
								content={{
									button({
										ready,
										isUploading,
										uploadProgress,
									}: {
										ready: boolean;
										isUploading: boolean;
										uploadProgress: number;
									}) {
										if (isUploading && uploadProgress === 100) {
											return (
												<Loader2Icon className="w-4 h-4 text-primary-500 animate-spin" />
											);
										}
										if (isUploading) return <div>{uploadProgress}%</div>;
										if (ready) return <div>Elige un archivo</div>;
										return "Cargando...";
									},
									allowedContent({
										ready,
										isUploading,
									}: {
										ready: boolean;
										isUploading: boolean;
									}) {
										if (!ready) return null;
										if (isUploading) return "Subiendo archivo...";
										return "Archivo hasta 4MB";
									},
								}}
								appearance={{
									button: ({
										ready,
										isUploading,
									}: {
										ready: boolean;
										isUploading: boolean;
									}) => {
										if (!ready) {
											return "bg-transparent text-xs text-muted-foreground border";
										}
										if (isUploading) {
											return "bg-transparent text-xs text-muted-foreground border after:bg-primary-400/60";
										}
										return "bg-transparent text-xs text-foreground border hover:text-primary-500 hover:border-primary-500";
									},
								}}
								endpoint={endpoint}
								onBeforeUploadBegin={(files: File[]) => {
									if (onUploading) onUploading(true);
									return files;
								}}
								onClientUploadComplete={(
									res: { url: string; serverData: Json }[],
								) => {
									if (onUploading) onUploading(false);
									if (res && res[0]?.url) {
										field.onChange(res[0].url);
										toast.success("Archivo subido correctamente");
									}
								}}
								onUploadError={(error) => {
									if (onUploading) onUploading(false);
									toast.error("Error al subir el archivo");
								}}
							/>
						</div>
					</FormControl>
					{description && <FormDescription>{description}</FormDescription>}
					{messagePosition === "bottom" && <FormMessage />}
				</FormItem>
			)}
		/>
	);
}
