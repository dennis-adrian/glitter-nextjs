CREATE OR REPLACE FUNCTION "enforce_stand_hold_member_cardinality"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hold_ids integer[];
  target_hold_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_hold_ids := ARRAY[OLD.hold_id];
  ELSIF TG_OP = 'UPDATE' AND OLD.hold_id IS DISTINCT FROM NEW.hold_id THEN
    target_hold_ids := ARRAY[OLD.hold_id, NEW.hold_id];
  ELSE
    target_hold_ids := ARRAY[NEW.hold_id];
  END IF;

  FOREACH target_hold_id IN ARRAY target_hold_ids LOOP
    IF EXISTS (SELECT 1 FROM "stand_holds" WHERE id = target_hold_id)
      AND (SELECT count(*) FROM "stand_hold_members" WHERE hold_id = target_hold_id) <> 1 THEN
      RAISE EXCEPTION 'stand hold % must have exactly one member during Phase 0B', target_hold_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_stand_reservation_member_cardinality"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_reservation_ids integer[];
  target_reservation_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_reservation_ids := ARRAY[OLD.reservation_id];
  ELSIF TG_OP = 'UPDATE' AND OLD.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
    target_reservation_ids := ARRAY[OLD.reservation_id, NEW.reservation_id];
  ELSE
    target_reservation_ids := ARRAY[NEW.reservation_id];
  END IF;

  FOREACH target_reservation_id IN ARRAY target_reservation_ids LOOP
    IF EXISTS (SELECT 1 FROM "stand_reservations" WHERE id = target_reservation_id)
      AND (SELECT count(*) FROM "stand_reservation_members" WHERE reservation_id = target_reservation_id) <> 1 THEN
      RAISE EXCEPTION 'stand reservation % must have exactly one member during Phase 0B', target_reservation_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
