-- Custom SQL migration file, put you code below! --
UPDATE "users" SET "verified"=TRUE, "category"='illustration', role='user' WHERE "role" = 'artist';