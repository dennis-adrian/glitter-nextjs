DELETE FROM "user_requests" AS ur
USING (
	SELECT id
	FROM (
		SELECT id,
			ROW_NUMBER() OVER (
				PARTITION BY user_id, festival_id, type
				ORDER BY
					CASE status
						WHEN 'accepted' THEN 0
						WHEN 'pending' THEN 1
						ELSE 2
					END,
					updated_at DESC,
					created_at DESC,
					id DESC
			) AS rn
		FROM "user_requests"
		WHERE festival_id IS NOT NULL
	) AS ranked
	WHERE rn > 1
) AS dups
WHERE ur.id = dups.id;--> statement-breakpoint
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_user_festival_type_unique" UNIQUE("user_id","festival_id","type");
