"use client";

import { useState } from "react";

import { cn } from "@/app/lib/utils";

import CouponBookProofForm from "@/app/components/festivals/festival_activities/coupon-book-proof-form";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogContent,
	DrawerDialogHeader,
	DrawerDialogTitle,
	DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";
import { NotebookPenIcon } from "lucide-react";

type CouponBookProofModalProps = {
	participationId: number;
	proofDisplayState: ProofDisplayState;
	adminFeedback?: string | null;
	existingPromoDescription?: string | null;
	existingPromoConditions?: string | null;
	triggerLabel?: string;
	triggerClassName?: string;
};

export default function CouponBookProofModal({
	participationId,
	proofDisplayState,
	adminFeedback,
	existingPromoDescription,
	existingPromoConditions,
	triggerLabel = "Cargar mi promoción",
	triggerClassName,
}: CouponBookProofModalProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [open, setOpen] = useState(false);

	return (
		<DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
			<DrawerDialogTrigger>
				<Button
					className={cn(
						"hover:text-white hover:bg-amber-700 w-full md:max-w-[280px] mx-auto",
						triggerClassName,
					)}
				>
					{triggerLabel}
					<NotebookPenIcon className="w-4 h-4 ml-2" />
				</Button>
			</DrawerDialogTrigger>
			<DrawerDialogContent isDesktop={isDesktop} className="max-w-md">
				<DrawerDialogHeader isDesktop={isDesktop}>
					<DrawerDialogTitle isDesktop={isDesktop}>
						{proofDisplayState === "rejected_resubmit"
							? "Editar promoción"
							: "Cargar promoción"}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className={`${isDesktop ? "" : "px-4 pb-4"} pt-2`}>
					<CouponBookProofForm
						participationId={participationId}
						proofDisplayState={proofDisplayState}
						adminFeedback={adminFeedback}
						existingPromoDescription={existingPromoDescription}
						existingPromoConditions={existingPromoConditions}
						onSuccess={() => setOpen(false)}
					/>
				</div>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
