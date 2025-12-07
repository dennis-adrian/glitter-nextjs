"use client";

import TryAgainForm from "@/app/components/festivals/festival_activities/try-again-form";
import { Dropzone } from "@/app/components/organisms/dropzone";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { addFestivalActivityParticipantProof } from "@/app/lib/festival_sectors/actions";
import { CheckCircleIcon, Loader2Icon, UploadCloudIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

type UploadStickerDesignModalProps = {
	participationId: number;
	maxFiles?: number;
};

export default function UploadStickerDesignModal({
	participationId,
	maxFiles: rawMaxFiles = 5,
}: UploadStickerDesignModalProps) {
	const maxFiles = Math.min(Math.max(rawMaxFiles, 1), 10); // guard [1,10]
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [uploadSuccess, setUploadSuccess] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState<
		{
			imageUrl: string;
			fileName: string;
			fileSize: number;
		}[]
	>([]);
	const [insertSuccess, setInsertSuccess] = useState(false);
	const [insertError, setInsertError] = useState(false);

	const generateContent = () => {
		if (insertError) {
			return (
				<div className="flex flex-col gap-2">
					{uploadedFiles.map((file) => (
						<div
							key={file.fileName}
							className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
						>
							<div className="relative w-6 h-6 object-cover">
								<Image
									src={file.imageUrl}
									alt={file.fileName}
									className="rounded-md"
									fill
								/>
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{file.fileName}</p>
								<p className="text-xs text-muted-foreground">
									{(file.fileSize / 1024).toFixed(1)} KB
								</p>
							</div>
						</div>
					))}
					<TryAgainForm
						imageUrls={uploadedFiles.map((file) => file.imageUrl)}
						participationId={participationId}
						onSuccess={() => {
							setInsertSuccess(true);
							setInsertError(false);
						}}
					/>
				</div>
			);
		}

		if (insertSuccess) {
			return (
				<div className="flex flex-col gap-2 items-center justify-center h-36">
					<CheckCircleIcon className="w-10 h-10 text-green-500" />
					<p className="text-sm text-green-500">
						{uploadedFiles.length === 1
							? "Diseño subido correctamente"
							: `Diseños subidos correctamente`}
					</p>
				</div>
			);
		}

		if (uploadSuccess) {
			return (
				<div className="flex flex-col gap-2 items-center justify-center h-36">
					<Loader2Icon className="w-10 h-10 animate-spin text-primary" />
					<p className="text-sm text-primary">Guardando</p>
				</div>
			);
		}

		return (
			<Dropzone
				maxFiles={maxFiles}
				maxSize={4 * 1024 * 1024}
				accept={["image/*"]}
				onUploadComplete={async (
					files: {
						imageUrl: string;
						fileName: string;
						fileSize: number;
					}[],
				) => {
					setUploadSuccess(true);
					setUploadedFiles(files);
					const res = await addFestivalActivityParticipantProof(
						participationId,
						files.map((file) => file.imageUrl),
					);
					if (res.success) {
						toast.success(res.message);
						setInsertSuccess(true);
					} else {
						toast.error(res.message);
						setInsertError(true);
					}
				}}
			/>
		);
	};
	return (
		<DrawerDialog
			isDesktop={isDesktop}
			onOpenChange={(open) => {
				if (!open) {
					setUploadSuccess(false);
					setInsertSuccess(false);
					setInsertError(false);
					setUploadedFiles([]);
				}
			}}
		>
			<DrawerDialogTrigger>
				<Button
					variant="outline"
					className="hover:text-white hover:bg-amber-700 w-full md:max-w-[280px]"
				>
					<span>Subir imagen</span>
					<UploadCloudIcon className="w-4 h-4 ml-2" />
				</Button>
			</DrawerDialogTrigger>
			<DrawerDialogContent isDesktop={isDesktop} className="max-w-md">
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						Subir imagen
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className={`${isDesktop ? "" : "px-4"} pt-2`}>
					{generateContent()}
				</div>
				{isDesktop ? null : (
					<DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
						<DrawerDialogClose isDesktop={isDesktop}>
							<Button variant="outline">Cerrar</Button>
						</DrawerDialogClose>
					</DrawerDialogFooter>
				)}
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
