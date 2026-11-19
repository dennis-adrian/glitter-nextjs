CREATE TYPE "public"."volunteer_application_status" AS ENUM('pending', 'accepted', 'rejected', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."volunteer_referral_source" AS ENUM('instagram', 'tiktok', 'friends', 'university', 'other');--> statement-breakpoint
CREATE TABLE "volunteer_application_assigned_shifts" (
	"application_id" integer NOT NULL,
	"shift_id" integer NOT NULL,
	CONSTRAINT "volunteer_application_assigned_shifts_application_id_shift_id_pk" PRIMARY KEY("application_id","shift_id")
);
--> statement-breakpoint
CREATE TABLE "volunteer_application_available_shifts" (
	"application_id" integer NOT NULL,
	"shift_id" integer NOT NULL,
	CONSTRAINT "volunteer_application_available_shifts_application_id_shift_id_pk" PRIMARY KEY("application_id","shift_id")
);
--> statement-breakpoint
CREATE TABLE "volunteer_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"birthdate" date NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"zone" text,
	"first_choice_role_id" integer NOT NULL,
	"second_choice_role_id" integer NOT NULL,
	"experience" text[] DEFAULT '{}'::text[] NOT NULL,
	"experience_notes" text,
	"portfolio" text,
	"motivation" text NOT NULL,
	"emergency_contact_name" text NOT NULL,
	"emergency_contact_phone" text NOT NULL,
	"referral_source" "volunteer_referral_source" NOT NULL,
	"consented_at" timestamp NOT NULL,
	"privacy_notice_version" text NOT NULL,
	"status" "volunteer_application_status" DEFAULT 'pending' NOT NULL,
	"assigned_role_id" integer,
	"admin_notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volunteer_applications_distinct_role_choices" CHECK ("volunteer_applications"."first_choice_role_id" <> "volunteer_applications"."second_choice_role_id"),
	CONSTRAINT "volunteer_applications_email_normalized" CHECK ("volunteer_applications"."email" = lower(btrim("volunteer_applications"."email"))),
	CONSTRAINT "volunteer_applications_motivation_length" CHECK (char_length("volunteer_applications"."motivation") <= 300)
);
--> statement-breakpoint
CREATE TABLE "volunteer_call_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"applications_close_at" timestamp NOT NULL,
	"induction_date" date,
	"induction_time" time,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volunteer_call_settings_festival_id_unique" UNIQUE("festival_id")
);
--> statement-breakpoint
CREATE TABLE "volunteer_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"needed_headcount" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volunteer_shifts_ends_after_start" CHECK ("volunteer_shifts"."ends_at" > "volunteer_shifts"."starts_at"),
	CONSTRAINT "volunteer_shifts_needed_headcount_nonnegative" CHECK ("volunteer_shifts"."needed_headcount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" ADD CONSTRAINT "volunteer_application_assigned_shifts_application_id_volunteer_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."volunteer_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_assigned_shifts" ADD CONSTRAINT "volunteer_application_assigned_shifts_shift_id_volunteer_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."volunteer_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" ADD CONSTRAINT "volunteer_application_available_shifts_application_id_volunteer_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."volunteer_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_application_available_shifts" ADD CONSTRAINT "volunteer_application_available_shifts_shift_id_volunteer_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."volunteer_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_first_choice_role_id_volunteer_roles_id_fk" FOREIGN KEY ("first_choice_role_id") REFERENCES "public"."volunteer_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_second_choice_role_id_volunteer_roles_id_fk" FOREIGN KEY ("second_choice_role_id") REFERENCES "public"."volunteer_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_assigned_role_id_volunteer_roles_id_fk" FOREIGN KEY ("assigned_role_id") REFERENCES "public"."volunteer_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_call_settings" ADD CONSTRAINT "volunteer_call_settings_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_roles" ADD CONSTRAINT "volunteer_roles_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "volunteer_application_assigned_shifts_shift_idx" ON "volunteer_application_assigned_shifts" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "volunteer_application_available_shifts_shift_idx" ON "volunteer_application_available_shifts" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_applications_festival_email_unique" ON "volunteer_applications" USING btree ("festival_id","email");--> statement-breakpoint
CREATE INDEX "volunteer_applications_festival_status_idx" ON "volunteer_applications" USING btree ("festival_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_roles_festival_name_unique" ON "volunteer_roles" USING btree ("festival_id","name");--> statement-breakpoint
CREATE INDEX "volunteer_roles_festival_idx" ON "volunteer_roles" USING btree ("festival_id","sort_order");--> statement-breakpoint
CREATE INDEX "volunteer_shifts_festival_idx" ON "volunteer_shifts" USING btree ("festival_id","sort_order");--> statement-breakpoint
-- Glitter v11's volunteer call: roles, shifts and settings.
--
-- The v11 festival is found, not assumed: the one festival of type `glitter`
-- with a day on 19 Dec 2026, La Paz time, in `festival_dates` or in
-- `festivals.start_date` (both hold UTC wall-clock). Zero or several matches
-- stop the migration with the candidates listed.
--
-- A database with no festivals at all (a fresh CI/test database, or a new
-- development database before `pnpm seed`), or one whose name marks it as a
-- test/CI database, has no v11 to find: the block skips with a NOTICE there.
--
-- Shift times are written on La Paz's clock and stored as UTC wall-clock.
-- Every insert skips what is already there, so a re-run adds nothing.
DO $$
DECLARE
	v11_id integer;
	match_count integer;
	match_list text;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "festivals")
		OR current_database() ~* '(^|[_-])(test|ci)([_-]|$)' THEN
		RAISE NOTICE 'volunteers: no Glitter v11 festival expected in database %, skipping the v11 roles, shifts and settings', current_database();
		RETURN;
	END IF;

	SELECT count(*), min(f."id"), string_agg(format('#%s "%s" (%s)', f."id", f."name", f."status"), ', ' ORDER BY f."id")
	INTO match_count, v11_id, match_list
	FROM "festivals" f
	WHERE f."festival_type" = 'glitter'
		AND (
			((f."start_date" AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date = DATE '2026-12-19'
			OR EXISTS (
				SELECT 1 FROM "festival_dates" d
				WHERE d."festival_id" = f."id"
					AND ((d."start_date" AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date = DATE '2026-12-19'
			)
		);

	IF match_count = 0 THEN
		RAISE EXCEPTION 'volunteers: Glitter v11 not found. Expected one festival with festival_type = ''glitter'' and a day on 2026-12-19 (America/La_Paz) in festival_dates or festivals.start_date. Create or fix that festival, then run the migration again.';
	ELSIF match_count > 1 THEN
		RAISE EXCEPTION 'volunteers: % festivals look like Glitter v11 (%); expected exactly one.', match_count, match_list;
	END IF;

	RAISE NOTICE 'volunteers: seeding the v11 volunteer call for festival %', match_list;

	-- Induction: Saturday 5 Dec 2026; no time of day decided yet.
	INSERT INTO "volunteer_call_settings" ("festival_id", "applications_close_at", "induction_date", "induction_time")
	VALUES (v11_id, (TIMESTAMP '2026-11-30 23:59' AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'UTC', DATE '2026-12-05', NULL)
	ON CONFLICT ("festival_id") DO NOTHING;

	INSERT INTO "volunteer_roles" ("festival_id", "name", "description", "sort_order")
	VALUES
		(v11_id, 'Acreditación y check-in de los visitantes y participantes', 'Recibís en el ingreso al público y a los expositores del festival, y verificás su registro.', 1),
		(v11_id, 'Orientación al público', 'Ayudas a los visitantes a encontrar stands, actividades y servicios del festival.', 2),
		(v11_id, 'Apoyo a expositores', 'Acompañas a los expositores en su llegada, el armado de su mesa y lo que necesiten durante el día.', 3),
		(v11_id, 'Montaje y desmontaje', 'Armas y desarmas mesas, decoración y señalética antes y después del festival.', 4),
		(v11_id, 'Fotografía y redes sociales', 'Registras el festival en fotos y videos para nuestras redes sociales.', 5),
		(v11_id, 'Actividades y talleres', 'Apoyas en talleres y actividades: inscripciones, materiales y tiempos.', 6)
	ON CONFLICT ("festival_id", "name") DO NOTHING;

	INSERT INTO "volunteer_shifts" ("festival_id", "label", "starts_at", "ends_at", "needed_headcount", "sort_order")
	SELECT v11_id, s.label,
		(s.starts_at AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'UTC',
		(s.ends_at AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'UTC',
		0, s.sort_order
	FROM (VALUES
		('Montaje', TIMESTAMP '2026-12-18 15:00', TIMESTAMP '2026-12-18 19:00', 1),
		('Terminar montaje', TIMESTAMP '2026-12-19 10:00', TIMESTAMP '2026-12-19 14:00', 2),
		('Festival (turno A)', TIMESTAMP '2026-12-19 13:30', TIMESTAMP '2026-12-19 17:30', 3),
		('Festival + cierre (turno B)', TIMESTAMP '2026-12-19 17:30', TIMESTAMP '2026-12-19 21:30', 4),
		('Festival (turno A)', TIMESTAMP '2026-12-20 13:30', TIMESTAMP '2026-12-20 17:30', 5),
		('Festival + desmontaje de mesas (turno B)', TIMESTAMP '2026-12-20 17:30', TIMESTAMP '2026-12-20 21:30', 6)
	) AS s(label, starts_at, ends_at, sort_order)
	WHERE NOT EXISTS (
		SELECT 1 FROM "volunteer_shifts" existing
		WHERE existing."festival_id" = v11_id
			AND existing."starts_at" = (s.starts_at AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'UTC'
			AND existing."label" = s.label
	);
END $$;
