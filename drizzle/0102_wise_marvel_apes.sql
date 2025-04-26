-- Custom SQL migration file, put you code below! --
UPDATE users
SET birthdate = DATE_TRUNC('day', birthdate) + INTERVAL '12 hours';
UPDATE users
SET phone_number = CONCAT('+591', phone_number)
WHERE phone_number NOT LIKE '+%';