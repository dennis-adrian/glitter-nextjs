ALTER TABLE "comunicado_revisions" ADD COLUMN "preview_text" text;--> statement-breakpoint
ALTER TABLE "comunicados" ADD COLUMN "preview_text" text;--> statement-breakpoint
ALTER TABLE "comunicado_revisions" ADD CONSTRAINT "comunicado_revisions_preview_text_length" CHECK ("comunicado_revisions"."preview_text" IS NULL OR char_length("comunicado_revisions"."preview_text") BETWEEN 1 AND 120);