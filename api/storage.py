"""
Postgres-backed storage for users and preferences.
"""
import os
from typing import Dict, List, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .models import User, UserCredentials, UserPreferences


class UserStorage:
    """
    Handles loading and saving users in Postgres.
    """

    def __init__(self, dsn: Optional[str] = None):
        self.dsn = dsn or os.getenv("DATABASE_URL")
        if not self.dsn:
            raise ValueError("DATABASE_URL environment variable not set")

    def _connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row)

    def _row_to_user(self, row: Dict) -> User:
        by_day = row.get("by_day") or {}
        return User(
            id=str(row["id"]),
            credentials=UserCredentials(
                username=row["username"],
                password=row["password_encrypted"],
            ),
            preferences=UserPreferences(by_day=by_day),
        )

    def get_user(self, user_id: str) -> Optional[User]:
        query = """
            select u.id, u.username, u.password_encrypted, p.by_day
            from users u
            left join preferences p on p.user_id = u.id
            where u.id = %s
        """
        with self._connect() as conn:
            row = conn.execute(query, (user_id,)).fetchone()
            if not row:
                return None
            return self._row_to_user(row)

    def get_user_by_username(self, username: str) -> Optional[User]:
        query = """
            select u.id, u.username, u.password_encrypted, p.by_day
            from users u
            left join preferences p on p.user_id = u.id
            where u.username = %s
        """
        with self._connect() as conn:
            row = conn.execute(query, (username,)).fetchone()
            if not row:
                return None
            return self._row_to_user(row)

    def upsert_user(self, username: str, password_encrypted: str) -> User:
        query = """
            insert into users (username, password_encrypted)
            values (%s, %s)
            on conflict (username)
            do update set password_encrypted = excluded.password_encrypted, updated_at = now()
            returning id, username, password_encrypted
        """
        with self._connect() as conn:
            row = conn.execute(query, (username, password_encrypted)).fetchone()
            if not row:
                raise RuntimeError("Failed to upsert user")
            # Fetch preferences if any
            pref = conn.execute(
                "select by_day from preferences where user_id = %s",
                (row["id"],),
            ).fetchone()
            row["by_day"] = pref["by_day"] if pref else {}
            return self._row_to_user(row)

    def save_preferences(self, user_id: str, by_day: Dict[str, List[str]]) -> None:
        query = """
            insert into preferences (user_id, by_day)
            values (%s, %s)
            on conflict (user_id)
            do update set by_day = excluded.by_day, updated_at = now()
        """
        with self._connect() as conn:
            conn.execute(query, (user_id, Json(by_day)))

    def list_users(self) -> List[User]:
        query = """
            select u.id, u.username, u.password_encrypted, p.by_day
            from users u
            left join preferences p on p.user_id = u.id
        """
        with self._connect() as conn:
            rows = conn.execute(query).fetchall()
            return [self._row_to_user(row) for row in rows]
