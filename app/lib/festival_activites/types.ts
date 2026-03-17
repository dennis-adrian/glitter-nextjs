import { userCategoryEnum } from "@/db/schema";

export type ActivityUserCategory = Exclude<
	(typeof userCategoryEnum.enumValues)[number],
	"none"
>;

export type ActivityConditionsConfig = {
	/** Ordered list of requirement strings shown to the user */
	requirements: string[];
};
