DROP INDEX "posts_slug_idx";--> statement-breakpoint
CREATE INDEX "idx_post_categories_to_posts_category_id" ON "post_categories_to_posts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_post_tags_to_posts_tag_id" ON "post_tags_to_posts" USING btree ("tag_id");