"use client";

import { Button } from "@/app/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { cn } from "@/app/lib/utils";
import { FC } from "react";

export const BaseModal: FC<{
	children: React.ReactNode;
	title?: string;
	show: boolean;
	contentClassName?: string;
	description?: string;
	onOpenChange: (open: boolean) => void;
}> = ({
	children,
	title,
	show,
	contentClassName,
	onOpenChange,
	description,
}) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");

	return (
		<Dialog open={show} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="text-left md:text-center text-xl">
						{title}
					</DialogTitle>

					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<div className={cn(isDesktop ? "" : "px-4", contentClassName)}>
					{children}
				</div>
				{isDesktop ? null : (
					<DialogFooter className="pt-2">
						<DialogClose asChild>
							<Button className="w-full" variant="outline">
								Cerrar
							</Button>
						</DialogClose>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default BaseModal;
