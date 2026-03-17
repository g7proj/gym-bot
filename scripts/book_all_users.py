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


def should_run_now() -> bool:
    """Ensure the job runs at 07:05 Europe/Rome, even with UTC cron."""
    now = datetime.now(ZoneInfo("Europe/Rome"))
    return now.hour == 7 and now.minute == 5


def main() -> None:
    if not should_run_now():
        print("Skipping run: not 07:05 Europe/Rome.")
        return

    storage = UserStorage()
    users = storage.list_users()
    if not users:
        print("No users found; nothing to do.")
        return

    crypto = CryptoUtils()
    for user in users:
        print(f"Processing user {user.id}")
        try:
            password = crypto.decrypt(user.credentials.password)
            credentials = Credentials(
                username=user.credentials.username,
                password=password,
            )

            client = GymClient()
            client.login(credentials)

            start_dt, end_dt = schedule.get_booking_window()
            time_start_dt, time_end_dt = schedule.get_daily_time_window()

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

            if available:
                available.sort(
                    key=lambda x: schedule.parse_api_time(x.get("StartTime"))
                    or schedule.time.min
                )
                first = available[0]

                lesson_date = schedule.parse_api_date(first["DateLesson"])
                start_time_obj = schedule.parse_api_time(first["StartTime"])
                end_time_obj = schedule.parse_api_time(first["EndTime"])
                start_datetime = schedule.datetime.combine(lesson_date, start_time_obj)
                end_datetime = schedule.datetime.combine(lesson_date, end_time_obj)

                book_response = client.book(
                    booking_id=first["IDServizio"],
                    start_time=start_datetime.isoformat(timespec="seconds"),
                    end_time=end_datetime.isoformat(timespec="seconds"),
                    lesson_id=first["IDLesson"],
                )

                if book_response.get("Successful"):
                    print(f"Booking successful for user {user.id}")
                else:
                    print(f"Booking failed for user {user.id}")
            else:
                print(f"No available lessons for user {user.id}")

        except Exception as exc:
            print(f"Error processing user {user.id}: {exc}")


if __name__ == "__main__":
    main()
