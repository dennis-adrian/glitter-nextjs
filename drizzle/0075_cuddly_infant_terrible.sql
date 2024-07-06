-- Custom SQL migration file, put you code below! --
INSERT INTO "scheduled_tasks" (due_date, reminder_time, profile_id, reservation_id, task_type)
SELECT DATE(inner_query.reservation_created_at) + INTERVAL '5 days', DATE(inner_query.reservation_created_at) + INTERVAL '4 days', inner_query.user_id, inner_query.reservation_id, 'stand_reservation' FROM (
	WITH RankedParticipations AS (
    SELECT 
        p.*, 
        reservations.created_at as reservation_created_at, 
        ROW_NUMBER() OVER (PARTITION BY p.reservation_id ORDER BY p.created_at) AS rn
    FROM 
        participations p
    LEFT JOIN 
        stand_reservations reservations ON reservations.id = p.reservation_id
    WHERE 
        reservations.status = 'pending' 
        AND reservations.festival_id = (SELECT id FROM festivals WHERE status = 'active')
	)
	
	SELECT *
	FROM RankedParticipations
	WHERE rn = 1
) AS inner_query;