import { products } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type BaseProduct = InferSelectModel<typeof products>;
