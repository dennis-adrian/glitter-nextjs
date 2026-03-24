"use client";

import { useState } from "react";

import { cn } from "@/app/lib/utils";

import CouponBookProofForm from "@/app/components/festivals/festival_activities/coupon-book-proof-form";
import { Button } from "@/app/components/ui/button";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";
import { NotebookPenIcon } from "lucide-react";
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogHeader,
	DialogTrigger,
} from "@/app/components/ui/dialog";

type CouponBookProofModalProps = {
	participationId: number;
	proofDisplayState: ProofDisplayState;
	adminFeedback?: string | null;
	existingPromoHighlight?: string | null;
	existingPromoDescription?: string | null;
	existingPromoConditions?: string | null;
	triggerLabel?: string;
	triggerClassName?: string;
	defaultOpen?: boolean;
	onSuccess?: () => void;
};

export default function CouponBookProofModal({
	participationId,
	proofDisplayState,
	adminFeedback,
	existingPromoHighlight,
	existingPromoDescription,
	existingPromoConditions,
	triggerLabel = "Cargar mi promoción",
	triggerClassName,
	defaultOpen,
	onSuccess,
}: CouponBookProofModalProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [open, setOpen] = useState(defaultOpen ?? false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					className={cn(
						"hover:text-white hover:bg-amber-700 w-full md:max-w-[280px] mx-auto",
						triggerClassName,
					)}
				>
					{triggerLabel}
					<NotebookPenIcon className="w-4 h-4 ml-2" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{proofDisplayState === "rejected_resubmit"
							? "Editar promoción"
							: "Cargar promoción"}
					</DialogTitle>
				</DialogHeader>
				<div className={`${isDesktop ? "" : "px-4 pb-4"} pt-2`}>
					<CouponBookProofForm
						participationId={participationId}
						proofDisplayState={proofDisplayState}
						adminFeedback={adminFeedback}
						existingPromoHighlight={existingPromoHighlight}
						existingPromoDescription={existingPromoDescription}
						existingPromoConditions={existingPromoConditions}
						onSuccess={() => {
							setOpen(false);
							onSuccess?.();
						}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
