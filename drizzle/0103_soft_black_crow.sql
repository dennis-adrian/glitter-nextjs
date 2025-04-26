-- Custom SQL migration file, put you code below! --
DELETE FROM user_socials
WHERE username IS NULL
	OR username = '';