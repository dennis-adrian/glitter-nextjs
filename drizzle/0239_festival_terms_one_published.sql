UPDATE "festival_terms_versions" AS v
SET "status" = 'archived', "updated_at" = now()
FROM (
	SELECT "document_id", max("version_number") AS "keep_version"
	FROM "festival_terms_versions"
	WHERE "status" = 'published'
	GROUP BY "document_id"
) AS latest
WHERE v."document_id" = latest."document_id"
	AND v."status" = 'published'
	AND v."version_number" < latest."keep_version";--> statement-breakpoint
CREATE UNIQUE INDEX "festival_terms_versions_one_published_per_document" ON "festival_terms_versions" USING btree ("document_id") WHERE "festival_terms_versions"."status" = 'published';
