import { InferInsertModel } from "drizzle-orm";
import { orderItems } from "@/db/schema";

export type NewOrderItem = InferInsertModel<typeof orderItems>;
