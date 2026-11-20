-- Volunteer applications may only name roles and shifts of their own festival.
-- Composite foreign keys on (id, festival_id) replace the plain id references,
-- so a cross-festival link fails at write time, not only in the server action.
-- A separate migration because 0316 is already applied on the preview database.
--
-- The (id, festival_id) unique constraints come first: the foreign keys need them.
ALTER TABLE "volunteer_roles" ADD CONSTRAINT "volunteer_roles_id_festival_id_unique" UNIQUE("id","festival_id");--> statement-breakpoint
ALTER TABLE "volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_id_festival_id_unique" UNIQUE("id","festival_id");--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_id_festival_id_unique" UNIQUE("id","festival_id");--> statement-breakpoint
ALTER TABLE "volunteer_applications" DROP CONSTRAINT "volunteer_applications_first_choice_role_id_volunteer_roles_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_applications" DROP CONSTRAINT "volunteer_applications_second_choice_role_id_volunteer_roles_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_applications" DROP CONSTRAINT "volunteer_applications_assigned_role_id_volunteer_roles_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_first_choice_role_festival_fk" FOREIGN KEY ("first_choice_role_id","festival_id") REFERENCES "public"."volunteer_roles"("id","festival_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_second_choice_role_festival_fk" FOREIGN KEY ("second_choice_role_id","festival_id") REFERENCES "public"."volunteer_roles"("id","festival_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_assigned_role_festival_fk" FOREIGN KEY ("assigned_role_id","festival_id") REFERENCES "public"."volunteer_roles"("id","festival_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Join rows carry the application's festival, filled from the application for
-- rows the preview database already holds.
ALTER TABLE "volunteer_application_available_shifts" ADD COLUMN "festival_id" integer;--> statement-breakpoint
UPDATE "volunteer_application_available_shifts" s SET "festival_id" = a."festival_id" FROM "volunteer_applications" a WHERE a."id" = s."application_id";--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" ALTER COLUMN "festival_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" ADD COLUMN "festival_id" integer;--> statement-breakpoint
UPDATE "volunteer_application_assigned_shifts" s SET "festival_id" = a."festival_id" FROM "volunteer_applications" a WHERE a."id" = s."application_id";--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" ALTER COLUMN "festival_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" DROP CONSTRAINT "volunteer_application_available_shifts_application_id_volunteer_applications_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" DROP CONSTRAINT "volunteer_application_available_shifts_shift_id_volunteer_shifts_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" DROP CONSTRAINT "volunteer_application_assigned_shifts_application_id_volunteer_applications_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" DROP CONSTRAINT "volunteer_application_assigned_shifts_shift_id_volunteer_shifts_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" ADD CONSTRAINT "volunteer_application_available_shifts_application_fk" FOREIGN KEY ("application_id","festival_id") REFERENCES "public"."volunteer_applications"("id","festival_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" ADD CONSTRAINT "volunteer_application_available_shifts_shift_fk" FOREIGN KEY ("shift_id","festival_id") REFERENCES "public"."volunteer_shifts"("id","festival_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" ADD CONSTRAINT "volunteer_application_assigned_shifts_application_fk" FOREIGN KEY ("application_id","festival_id") REFERENCES "public"."volunteer_applications"("id","festival_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" ADD CONSTRAINT "volunteer_application_assigned_shifts_shift_fk" FOREIGN KEY ("shift_id","festival_id") REFERENCES "public"."volunteer_shifts"("id","festival_id") ON DELETE no action ON UPDATE no action;
