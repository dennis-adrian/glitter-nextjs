DO $$ 
BEGIN
    CREATE TYPE "reservation_status" AS ENUM('pending', 'verification_payment', 'accepted', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "stand_reservations" 
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE reservation_status 
  USING "status"::text::reservation_status,
ALTER COLUMN "status" SET DEFAULT 'pending'::reservation_status;