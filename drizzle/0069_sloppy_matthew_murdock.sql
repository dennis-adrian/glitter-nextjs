-- Custom SQL migration file, put you code below! --
UPDATE "users" SET "status"='verified' WHERE "verified"=TRUE;--> statement-breakpoint
UPDATE "users" SET "status"='banned' WHERE "banned"=TRUE;--> statement-breakpoint