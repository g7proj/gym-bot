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

-- Upsert preferences by user_id
-- params: $1=user_id, $2=by_day_jsonb
insert into preferences (user_id, by_day)
values ($1, $2)
on conflict (user_id)
do update set by_day = excluded.by_day, updated_at = now()
returning user_id, by_day;

-- Get preferences by user_id
-- params: $1=user_id
select user_id, by_day
from preferences
where user_id = $1;
