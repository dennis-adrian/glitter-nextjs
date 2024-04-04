-- Custom SQL migration file, put you code below! --
INSERT INTO profile_tasks (due_date, reminder_time, profile_id, updated_at, created_at)
SELECT CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '3 days', users.id, NOW(), NOW()
FROM users
WHERE role = 'user'
AND (
	COALESCE(display_name, '') IN ('')
	OR COALESCE(first_name, '') IN ('')
	OR COALESCE(last_name, '') IN ('')
	OR COALESCE(phone_number, '') IN ('')
	OR COALESCE(image_url, '') IN ('')
	OR COALESCE(bio, '') IN ('')
	OR birthdate IS NULL
);