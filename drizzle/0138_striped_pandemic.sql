CREATE TABLE "stand_subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"stand_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stand_subcategories" ADD CONSTRAINT "stand_subcategories_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_subcategories" ADD CONSTRAINT "stand_subcategories_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;