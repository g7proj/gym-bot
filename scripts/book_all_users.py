import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from api.storage import UserStorage
from utils.crypto import CryptoUtils
from gym_bot.client import GymClient
from gym_bot.config import Credentials
from gym_bot import schedule


TIMEZONE = "Europe/Rome"
LOCK_TTL_MINUTES = 20
LOCK_RETRY_MINUTES = 5


def should_run_now() -> bool:
    """Ensure the job runs after 07:00 Europe/Rome, even with UTC cron."""
    now = datetime.now(ZoneInfo(TIMEZONE))
    return now.hour >= 7


def run_date_today() -> datetime.date:
    return datetime.now(ZoneInfo(TIMEZONE)).date()


def main() -> None:
    if not should_run_now():
        print("Skipping run: not after 07:00 Europe/Rome.")
        return

    storage = UserStorage()
    users = storage.list_users()
    if not users:
        print("No users found; nothing to do.")
        return

    crypto = CryptoUtils()
    run_date = run_date_today()

    for user in users:
        print(f"Processing user {user}")

        acquired, run_id, status = storage.acquire_booking_lock(
            user_id=user.id,
            run_date=run_date,
            ttl_minutes=LOCK_TTL_MINUTES,
        )

        if not acquired:
            print(f"Skipping user {user.id}: lock not acquired (status={status})")
            continue

        try:
            print(f"Decrypting credentials for user {user.id}")
            print(f"User {user.id} has username: {user.credentials.username}")
            password = crypto.decrypt(user.credentials.password)
            print(f"Creating credentials object for user {user.id}")
            credentials = Credentials(
                username=user.credentials.username,
                password=password,
            )

            print(f"Logging in for user {user.id}")
            client = GymClient()
            client.login(credentials)

            start_dt, end_dt = schedule.get_booking_window()
            time_start_dt, time_end_dt = schedule.get_daily_time_window()

            print(f"Fetching available lessons for user {user.id}")
            response = client.list_with_mine(
                start_date=start_dt.isoformat(timespec="seconds"),
                end_date=end_dt.isoformat(timespec="seconds"),
                time_start=time_start_dt.isoformat(timespec="seconds"),
                time_end=time_end_dt.isoformat(timespec="seconds"),
                types=None,
            )

            items = response.get("Items", [])
            preferences = user.preferences.by_day or {}

            filtered = []
            for item in items:
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

            twentieth_day = end_dt.date()
            available = [
                item
                for item in filtered
                if item.get("AvailablePlaces", 0) > 0
                and schedule.parse_api_date(item.get("DateLesson")) == twentieth_day
            ]

            if not available:
                print(f"No available lessons for user {user.id} on {twentieth_day}")
                storage.mark_booking_completed(user.id, run_date, run_id)
                continue

            # Book all available lessons for the 20th day
            available.sort(
                key=lambda x: schedule.parse_api_time(x.get("StartTime"))
                or schedule.time.min
            )

            for lesson in available:
                lesson_date = schedule.parse_api_date(lesson["DateLesson"])
                start_time_obj = schedule.parse_api_time(lesson["StartTime"])
                end_time_obj = schedule.parse_api_time(lesson["EndTime"])
                start_datetime = schedule.datetime.combine(lesson_date, start_time_obj)
                end_datetime = schedule.datetime.combine(lesson_date, end_time_obj)

                print(
                    f"Attempting to book lesson {lesson.get('IDLesson')} for user {user.id} "
                    f"on {start_datetime}"
                )
                book_response = client.book(
                    booking_id=lesson["IDServizio"],
                    start_time=start_datetime.isoformat(timespec="seconds"),
                    end_time=end_datetime.isoformat(timespec="seconds"),
                    lesson_id=lesson["IDLesson"],
                )

                if book_response.get("Successful"):
                    print(
                        f"Booking successful for user {user.id} lesson {lesson.get('IDLesson')}"
                    )
                else:
                    print(
                        f"Booking failed for user {user.id} lesson {lesson.get('IDLesson')}"
                    )

            storage.mark_booking_completed(user.id, run_date, run_id)

        except Exception as exc:
            print(f"Error processing user {user.id}: {exc}")
            storage.mark_booking_failed(
                user_id=user.id,
                run_date=run_date,
                run_id=run_id,
                error=str(exc),
                retry_minutes=LOCK_RETRY_MINUTES,
            )


if __name__ == "__main__":
    main()
