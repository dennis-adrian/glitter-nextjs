-- Custom SQL migration file, put you code below! --
UPDATE "user_requests" SET "type" = 'profile_verification' WHERE "type" = 'become_artist';