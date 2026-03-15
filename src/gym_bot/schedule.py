from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Tuple


WEEKDAY_EN: Dict[int, str] = {
    0: "monday",
    1: "tuesday",
    2: "wednesday",
    3: "thursday",
    4: "friday",
    5: "saturday",
    6: "sunday",
}


def parse_api_date(date_str: str | None) -> date | None:
    """
    Parse a DateLesson string from the API (e.g. '2026-03-16T00:00:00')
    into a date object.
    """
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str).date()
    except (TypeError, ValueError):
        return None


def parse_api_time(time_str: str | None) -> time | None:
    """
    Parse a StartTime/EndTime string from the API (e.g. '1900-01-01T06:15:00')
    into a time object.
    """
    if not time_str:
        return None
    try:
        return datetime.fromisoformat(time_str).time()
    except (TypeError, ValueError):
        return None


def get_booking_window(today: date | None = None) -> Tuple[datetime, datetime]:
    """
    Return start and end datetime for the 20-day booking window.

    The window includes 'today' and goes up to today+19 (20 days total).
    """
    if today is None:
        today = date.today()
    end_day = today + timedelta(days=19)
    start_dt = datetime.combine(today, time(0, 0, 0))
    end_dt = datetime.combine(end_day, time(0, 0, 0))
    return start_dt, end_dt


def get_daily_time_window(today: date | None = None) -> Tuple[datetime, datetime]:
    """
    Return start and end datetime for the daily time window (~7:00 to 23:59:59).

    The date component is today (or the given date), time is fixed.
    """
    if today is None:
        today = date.today()
    start_dt = datetime.combine(today, time(7, 0, 0))
    end_dt = datetime.combine(today, time(23, 59, 59))
    return start_dt, end_dt


def filter_lessons_by_preferences(
    lessons: List[Dict[str, Any]],
    preferences: Dict[str, List[str]],
) -> List[Dict[str, Any]]:
    """
    Filter lessons based on weekly course preferences.

    preferences: mapping from weekday name (e.g. 'monday') to list of
    lowercase keywords that must be contained in ServiceDescription.
    """
    if not preferences:
        return lessons

    filtered: List[Dict[str, Any]] = []
    for item in lessons:
        date_lesson_str = item.get("DateLesson")
        service_desc = (item.get("ServiceDescription") or "").lower()
        if not date_lesson_str or not service_desc:
            continue

        d = parse_api_date(date_lesson_str)
        if d is None:
            continue

        weekday_name = WEEKDAY_EN.get(d.weekday())
        if not weekday_name:
            continue

        wanted_keywords = preferences.get(weekday_name, [])
        if any(keyword in service_desc for keyword in wanted_keywords):
            filtered.append(item)

    return filtered

