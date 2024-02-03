CREATE TABLE IF NOT EXISTS "stand_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_holder_id" integer NOT NULL,
	"stand_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
