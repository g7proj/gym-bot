"""
Postgres-backed storage for users and preferences.
"""
import os
from typing import Dict, List, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

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

    def _build_by_day(self, rows: List[Dict]) -> Dict[str, List[str]]:
        by_day: Dict[str, List[str]] = {}
        for row in rows:
            weekday = row["weekday"]
            course = row["course"]
            by_day.setdefault(weekday, []).append(course)
        return by_day

    def _row_to_user(self, row: Dict, by_day: Dict[str, List[str]]) -> User:
        return User(
            id=str(row["id"]),
            credentials=UserCredentials(
                username=row["username"],
                password=row["password_encrypted"],
            ),
            preferences=UserPreferences(by_day=by_day),
        )

    def _fetch_preferences(self, conn, user_id: str) -> Dict[str, List[str]]:
        rows = conn.execute(
            "select weekday, course from preferences where user_id = %s",
            (user_id,),
        ).fetchall()
        return self._build_by_day(rows)

    def get_user(self, user_id: str) -> Optional[User]:
        query = "select id, username, password_encrypted from users where id = %s"
        with self._connect() as conn:
            row = conn.execute(query, (user_id,)).fetchone()
            if not row:
                return None
            by_day = self._fetch_preferences(conn, str(row["id"]))
            return self._row_to_user(row, by_day)

    def get_user_by_username(self, username: str) -> Optional[User]:
        query = "select id, username, password_encrypted from users where username = %s"
        with self._connect() as conn:
            row = conn.execute(query, (username,)).fetchone()
            if not row:
                return None
            by_day = self._fetch_preferences(conn, str(row["id"]))
            return self._row_to_user(row, by_day)

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
            by_day = self._fetch_preferences(conn, str(row["id"]))
            return self._row_to_user(row, by_day)

    def save_preferences(self, user_id: str, by_day: Dict[str, List[str]]) -> None:
        normalized: Dict[str, List[str]] = {}
        for weekday, courses in by_day.items():
            cleaned = sorted({str(c).strip().lower() for c in courses if str(c).strip()})
            if cleaned:
                normalized[weekday] = cleaned

        with self._connect() as conn:
            conn.execute("delete from preferences where user_id = %s", (user_id,))
            rows: List[Tuple[str, str, str]] = []
            for weekday, courses in normalized.items():
                for course in courses:
                    rows.append((user_id, weekday, course))
            if rows:
                with conn.cursor() as cur:
                    cur.executemany(
                        "insert into preferences (user_id, weekday, course) values (%s, %s, %s)",
                        rows,
                    )
            conn.commit()

    def replace_preferences_for_user(
        self,
        user_id: str,
        by_day: Dict[str, List[str]],
        allowed_courses: Dict[str, List[str]] | None = None,
    ) -> None:
        normalized: Dict[str, List[str]] = {}
        allowed_norm: Dict[str, List[str]] = {}
        if allowed_courses:
            for weekday, courses in allowed_courses.items():
                allowed_norm[weekday] = sorted({c.strip().lower() for c in courses if c.strip()})

        for weekday, courses in by_day.items():
            cleaned = {str(c).strip().lower() for c in courses if str(c).strip()}
            if allowed_norm:
                cleaned = {c for c in cleaned if c in allowed_norm.get(weekday, [])}
            if cleaned:
                normalized[weekday] = sorted(cleaned)

        with self._connect() as conn:
            conn.execute("delete from preferences where user_id = %s", (user_id,))
            rows: List[Tuple[str, str, str]] = []
            for weekday, courses in normalized.items():
                for course in courses:
                    rows.append((user_id, weekday, course))
            if rows:
                with conn.cursor() as cur:
                    cur.executemany(
                        "insert into preferences (user_id, weekday, course) values (%s, %s, %s)",
                        rows,
                    )
            conn.commit()

    def list_users(self) -> List[User]:
        with self._connect() as conn:
            user_rows = conn.execute(
                "select id, username, password_encrypted from users"
            ).fetchall()
            if not user_rows:
                return []

            user_ids = [str(row["id"]) for row in user_rows]
            prefs_rows = conn.execute(
                "select user_id, weekday, course from preferences where user_id = any(%s)",
                (user_ids,),
            ).fetchall()

            by_user: Dict[str, Dict[str, List[str]]] = {}
            for row in prefs_rows:
                uid = str(row["user_id"])
                by_user.setdefault(uid, {}).setdefault(row["weekday"], []).append(row["course"])

            users: List[User] = []
            for row in user_rows:
                uid = str(row["id"])
                by_day = by_user.get(uid, {})
                users.append(self._row_to_user(row, by_day))

            return users
