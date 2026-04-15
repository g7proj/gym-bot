-- Users

-- Insert or update user (by username)
-- Returns: id, username, password_encrypted
-- params: $1=username, $2=password_encrypted
insert into users (username, password_encrypted)
values ($1, $2)
on conflict (username)
do update set password_encrypted = excluded.password_encrypted, updated_at = now()
returning id, username, password_encrypted;

-- Get user by id
-- params: $1=user_id
select id, username, password_encrypted
from users
where id = $1;

-- Get user by username
-- params: $1=username
select id, username, password_encrypted
from users
where username = $1;

-- Preferences

-- Delete preferences by user_id
-- params: $1=user_id
delete from preferences where user_id = $1;

-- Insert preference slot
-- params: $1=user_id, $2=weekday, $3=course, $4=lesson_start_time
insert into preferences (user_id, weekday, course, lesson_start_time)
values ($1, $2, $3, $4);

-- Get preferences by user_id
-- params: $1=user_id
select user_id, weekday, course, lesson_start_time
from preferences
where user_id = $1;
