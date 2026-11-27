-- "¿Por qué querés ser voluntario/a?" allows 500 characters (was 300).
-- A separate migration because 0316 is already applied on the preview database.
ALTER TABLE "volunteer_applications" DROP CONSTRAINT "volunteer_applications_motivation_length";--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_motivation_length" CHECK (char_length("volunteer_applications"."motivation") <= 500);