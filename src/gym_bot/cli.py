from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List

try:
    # Optional: makes local development easier if python-dotenv is installed.
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None  # type: ignore[assignment]

from .client import GymClient, GymClientError
from .config import Credentials, get_credentials
from .courses_config import load_course_preferences
from . import schedule


def _print_lessons(lessons: List[Dict[str, Any]]) -> None:
    print(f"Found {len(lessons)} courses in the selected period:")
    for item in lessons:
        date_lesson_str = item.get("DateLesson")
        start_time_str = item.get("StartTime")
        service = item.get("ServiceDescription", "<sconosciuto>")
        category = item.get("CategoryDescription", "")
        available = item.get("AvailablePlaces")

        d = schedule.parse_api_date(date_lesson_str)
        t = schedule.parse_api_time(start_time_str)

        if d is not None:
            weekday_name = schedule.WEEKDAY_EN.get(d.weekday(), d.strftime("%A").lower())
            formatted_date = f"{d:%Y-%m-%d} ({weekday_name})"
        else:
            formatted_date = date_lesson_str or "?"

        if t is not None:
            formatted_start_time = f"{t:%H:%M}"
        else:
            formatted_start_time = start_time_str or "?"

        print(
            f"- {formatted_date} {formatted_start_time} | {service} [{category}] "
            f"| available places: {available}"
        )


def _filter_lessons_by_preferences(
    lessons: List[Dict[str, Any]],
    preferences: Dict[str, List[str]],
) -> List[Dict[str, Any]]:
    if not preferences:
        return lessons

    filtered: List[Dict[str, Any]] = []
    for item in lessons:
        date_lesson_str = item.get("DateLesson")
        service_desc = (item.get("ServiceDescription") or "").lower()
        if not date_lesson_str or not service_desc:
            continue

        d = schedule.parse_api_date(date_lesson_str)
        if d is None:
            continue

        weekday_name = schedule.WEEKDAY_EN.get(d.weekday())
        if not weekday_name:
            continue

        wanted_keywords = preferences.get(weekday_name, [])
        if any(keyword in service_desc for keyword in wanted_keywords):
            filtered.append(item)

    return filtered


def main() -> None:
    # Load .env if available (for local development convenience)
    if load_dotenv is not None:
        load_dotenv()

    try:
        credentials: Credentials = get_credentials()
    except RuntimeError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        raise SystemExit(1)

    client = GymClient()

    try:
        client.login(credentials)
    except GymClientError as exc:
        print(f"Login failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print("Login successful.")

    # Calcola l'intervallo di 20 giorni: oggi incluso fino a oggi+19.
    start_dt, end_dt = schedule.get_booking_window()

    # Fascia oraria giornaliera (circa 7-24)
    time_start_dt, time_end_dt = schedule.get_daily_time_window()

    start_date_str = start_dt.isoformat(timespec="seconds")
    end_date_str = end_dt.isoformat(timespec="seconds")
    time_start_str = time_start_dt.isoformat(timespec="seconds")
    time_end_str = time_end_dt.isoformat(timespec="seconds")

    try:
        response = client.list_with_mine(
            start_date=start_date_str,
            end_date=end_date_str,
            time_start=time_start_str,
            time_end=time_end_str,
            types=None,
        )
    except GymClientError as exc:
        print(f"Error retrieving lessons: {exc}", file=sys.stderr)
        raise SystemExit(1)

    items = response.get("Items") or []
    if not isinstance(items, list):
        print("Lessons response not in expected format (missing 'Items').", file=sys.stderr)
        raise SystemExit(1)

    # Load course preferences from YAML file (if present).
    preferences = load_course_preferences()

    filtered_lessons = _filter_lessons_by_preferences(items, preferences)

    print(
        f"Total lessons in the period: {len(items)}. "
        f"Lessons respecting the preferences: {len(filtered_lessons)}."
    )

    _print_lessons(filtered_lessons)


if __name__ == "__main__":
    main()

