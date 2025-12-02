ALTER TABLE "festival_activity_votes"
ADD CONSTRAINT "festival_activity_votes_polymorphic_check" CHECK (num_nonnulls(stand_id, participant_id) = 1);