"use server";

import {
  fetchActiveFestival,
  fetchActiveFestivalBase,
} from "@/app/data/festivals/actions";
import { cache } from "react";

export const getActiveFestival = cache(async () => {
  return await fetchActiveFestival({});
});
