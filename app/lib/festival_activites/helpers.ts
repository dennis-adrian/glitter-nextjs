import {
	FestivalActivity,
	FestivalActivityDetail,
} from "@/app/lib/festivals/definitions";
import { ActivityConditionsConfig } from "@/app/lib/festival_activites/types";

export function resolveConditions(
	detail: FestivalActivityDetail,
	activity: FestivalActivity,
): ActivityConditionsConfig {
	const detailConditions = detail.conditions as ActivityConditionsConfig | null;
	const activityConditions =
		activity.conditions as ActivityConditionsConfig | null;

	return {
		requirements:
			detailConditions?.requirements !== undefined
				? detailConditions.requirements
				: (activityConditions?.requirements ?? []),
	};
}
