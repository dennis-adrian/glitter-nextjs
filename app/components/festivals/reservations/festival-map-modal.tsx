"use client";

import { Button } from "@/app/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/app/components/ui/drawer";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { cn } from "@/app/lib/utils";
import { ChevronRightIcon, MapIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type FestivalMapModalProps = {
	generalMapUrl: string | null;
};

export default function FestivalMapModal({
	generalMapUrl,
}: FestivalMapModalProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

	return (
		<>
			<Button
				variant="outline"
				onClick={() => setOpen(true)}
				className="flex h-auto w-full items-center gap-3 rounded-xl p-4"
			>
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
					<MapIcon className="h-5 w-5 text-primary" />
				</div>
				<div className="flex-1 text-left">
					<p className="text-sm">Ver mapa general del festival</p>
					<p className="text-xs text-muted-foreground">
						Explorar distribución de sectores
					</p>
				</div>
				<ChevronRightIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
			</Button>

			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent>
					{isDesktop && (
						<DrawerClose asChild>
							<Button
								variant="ghost"
								size="icon"
								className="absolute top-3 right-3 z-10"
							>
								<XIcon className="h-4 w-4" />
								<span className="sr-only">Cerrar</span>
							</Button>
						</DrawerClose>
					)}

					<DrawerHeader className={cn(isDesktop && "text-left")}>
						<DrawerTitle>Mapa del Festival</DrawerTitle>
						<DrawerDescription>
							Vista general de la distribución de zonas y stands del evento.
						</DrawerDescription>
					</DrawerHeader>

					<div
						className={cn("px-4 pb-4", isDesktop && "flex-1 overflow-y-auto")}
					>
						{generalMapUrl ? (
							<div className="relative w-full">
								<Image
									src={generalMapUrl}
									alt="Mapa general del festival"
									width={800}
									height={600}
									className="mx-auto rounded-lg object-contain"
									unoptimized
								/>
							</div>
						) : (
							<div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
								<MapIcon className="h-10 w-10" />
								<p className="text-sm">
									El mapa general no está disponible en este momento.
								</p>
							</div>
						)}
					</div>

					{!isDesktop && (
						<DrawerFooter>
							<DrawerClose asChild>
								<Button variant="outline" className="w-full">
									Cerrar
								</Button>
							</DrawerClose>
						</DrawerFooter>
					)}
				</DrawerContent>
			</Drawer>
		</>
	);
}
