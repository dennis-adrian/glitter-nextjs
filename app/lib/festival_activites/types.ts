import { userCategoryEnum } from "@/db/schema";

export type ActivityUserCategory = Exclude<
	(typeof userCategoryEnum.enumValues)[number],
	"none"
>;

export type ActivityConditionsConfig = {
	/** Ordered list of requirement strings shown to the user */
	requirements: string[];
};

export type ProofType = "image" | "text" | "both";

export type ProofStatus =
	| "pending_review"
	| "approved"
	| "rejected_resubmit"
	| "rejected_removed";

/** Derived display state — not stored in DB */
export type ProofDisplayState = "pending_proof" | ProofStatus;
