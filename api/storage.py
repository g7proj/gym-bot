"""
Postgres-backed storage for users and preferences.
"""
import os
from datetime import date, datetime, time as time_cls, timedelta
from typing import Dict, List, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

from .models import PreferenceSlot, User, UserCredentials, UserPreferences


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

    def _normalize_time(self, value) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, time_cls):
            return value.isoformat(timespec="seconds")

        text = str(value).strip()
        if not text:
            return None

        try:
            if "T" in text:
                return datetime.fromisoformat(text).time().isoformat(timespec="seconds")
            return time_cls.fromisoformat(text).isoformat(timespec="seconds")
        except ValueError:
            return None

    def _normalize_slot(self, slot) -> Optional[Tuple[str, str]]:
        if slot is None:
            return None

        if isinstance(slot, dict):
            course_value = slot.get("course")
            time_value = slot.get("lesson_start_time")
        else:
            course_value = getattr(slot, "course", None)
            time_value = getattr(slot, "lesson_start_time", None)

        course = str(course_value or "").strip().lower()
        lesson_start_time = self._normalize_time(time_value)
        if not course or not lesson_start_time:
            return None
        return course, lesson_start_time

    def _build_by_day(self, rows: List[Dict]) -> Dict[str, List[PreferenceSlot]]:
        by_day: Dict[str, List[PreferenceSlot]] = {}
        for row in rows:
            weekday = str(row.get("weekday") or "").strip().lower()
            course = str(row.get("course") or "").strip().lower()
            lesson_start_time = self._normalize_time(row.get("lesson_start_time"))
            if not weekday or not course or not lesson_start_time:
                continue
            by_day.setdefault(weekday, []).append(
                PreferenceSlot(course=course, lesson_start_time=lesson_start_time)
            )

        for slots in by_day.values():
            slots.sort(key=lambda slot: (slot.lesson_start_time, slot.course))
        return by_day

    def _row_to_user(self, row: Dict, by_day: Dict[str, List[PreferenceSlot]]) -> User:
        return User(
            id=str(row["id"]),
            credentials=UserCredentials(
                username=row["username"],
                password=row["password_encrypted"],
            ),
            preferences=UserPreferences(by_day=by_day),
        )

    def _fetch_preferences(self, conn, user_id: str) -> Dict[str, List[PreferenceSlot]]:
        rows = conn.execute(
            """
            select weekday, course, lesson_start_time
            from preferences
            where user_id = %s
            order by weekday, lesson_start_time, course
            """,
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

    def save_preferences(self, user_id: str, by_day: Dict[str, List[Dict]]) -> None:
        normalized: Dict[str, List[Tuple[str, str]]] = {}
        for weekday, slots in by_day.items():
            cleaned: List[Tuple[str, str]] = []
            for slot in slots or []:
                normalized_slot = self._normalize_slot(slot)
                if normalized_slot:
                    cleaned.append(normalized_slot)
            if cleaned:
                normalized[str(weekday).strip().lower()] = sorted(set(cleaned))

        with self._connect() as conn:
            conn.execute("delete from preferences where user_id = %s", (user_id,))
            rows: List[Tuple[str, str, str, str]] = []
            for weekday, courses in normalized.items():
                for course, lesson_start_time in courses:
                    rows.append((user_id, weekday, course, lesson_start_time))
            if rows:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        insert into preferences (user_id, weekday, course, lesson_start_time)
                        values (%s, %s, %s, %s)
                        """,
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
                """
                select user_id, weekday, course, lesson_start_time
                from preferences
                where user_id = any(%s)
                order by user_id, weekday, lesson_start_time, course
                """,
                (user_ids,),
            ).fetchall()

            by_user: Dict[str, Dict[str, List[PreferenceSlot]]] = {}
            for row in prefs_rows:
                uid = str(row["user_id"])
                lesson_start_time = self._normalize_time(row.get("lesson_start_time"))
                if not lesson_start_time:
                    continue
                by_user.setdefault(uid, {}).setdefault(str(row["weekday"]), []).append(
                    PreferenceSlot(
                        course=str(row["course"]).strip().lower(),
                        lesson_start_time=lesson_start_time,
                    )
                )

            for user_prefs in by_user.values():
                for slots in user_prefs.values():
                    slots.sort(key=lambda slot: (slot.lesson_start_time, slot.course))

            users: List[User] = []
            for row in user_rows:
                uid = str(row["id"])
                by_day = by_user.get(uid, {})
                users.append(self._row_to_user(row, by_day))

            return users

    def acquire_booking_lock(
        self,
        user_id: str,
        run_date: date,
        ttl_minutes: int = 20,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        with self._connect() as conn:
            row = conn.execute(
                "select * from acquire_booking_lock(%s, %s, %s)",
                (user_id, run_date, f"{ttl_minutes} minutes"),
            ).fetchone()
            if not row:
                return False, None, None
            return bool(row["acquired"]), row.get("run_id"), row.get("status")

    def complete_booking_lock(
        self,
        user_id: str,
        run_date: date,
        run_id: str,
        status: str,
        error: Optional[str] = None,
        lock_until: Optional[datetime] = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                update booking_daily_lock
                   set status = %s,
                       error = %s,
                       locked_until = %s
                 where user_id = %s
                   and run_date = %s
                   and run_id = %s
                """,
                (
                    status,
                    error,
                    lock_until,
                    user_id,
                    run_date,
                    run_id,
                ),
            )
            conn.commit()

    def mark_booking_completed(self, user_id: str, run_date: date, run_id: str) -> None:
        self.complete_booking_lock(
            user_id=user_id,
            run_date=run_date,
            run_id=run_id,
            status="completed",
            lock_until=datetime.utcnow(),
        )

    def mark_booking_failed(
        self,
        user_id: str,
        run_date: date,
        run_id: str,
        error: str,
        retry_minutes: int = 5,
    ) -> None:
        self.complete_booking_lock(
            user_id=user_id,
            run_date=run_date,
            run_id=run_id,
            status="failed",
            error=error,
            lock_until=datetime.utcnow() + timedelta(minutes=retry_minutes),
        )
