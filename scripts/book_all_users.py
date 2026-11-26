import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from api.storage import UserStorage
from gym_bot.client import GymClient
from gym_bot.config import Credentials
from gym_bot import schedule
from utils.crypto import CryptoUtils


TIMEZONE = "Europe/Rome"
LOCK_TTL_MINUTES = 20
LOCK_RETRY_MINUTES = 5


def should_run_now() -> bool:
    """Ensure the job runs after 07:00 Europe/Rome, even with UTC cron."""
    now = datetime.now(ZoneInfo(TIMEZONE))
    return now.hour >= 7


def run_date_today():
    return datetime.now(ZoneInfo(TIMEZONE)).date()


def normalize_time_label(value) -> str | None:
    text = str(value or '').strip()
    if not text:
        return None
    if 'T' in text:
        text = text.split('T', 1)[1]
    parts = text.split(':')
    if len(parts) < 2:
        return None
    hours = parts[0].zfill(2)
    minutes = parts[1].zfill(2)
    seconds = parts[2].zfill(2) if len(parts) > 2 and parts[2] else '00'
    return f'{hours}:{minutes}:{seconds}'


def normalize_preference_slot(slot) -> tuple[str, str] | None:
    if slot is None:
        return None

    if isinstance(slot, dict):
        course = slot.get('course')
        lesson_start_time = slot.get('lesson_start_time')
    else:
        course = getattr(slot, 'course', None)
        lesson_start_time = getattr(slot, 'lesson_start_time', None)

    normalized_course = str(course or '').strip().lower()
    normalized_time = normalize_time_label(lesson_start_time)
    if not normalized_course or not normalized_time:
        return None

    return normalized_course, normalized_time


def parse_int(value: object, default: int = 0) -> int:
    try:
        return int(value) if value not in (None, '') else default
    except (TypeError, ValueError):
        return default


def is_lesson_already_booked(lesson: dict) -> bool:
    """Check whether the user is already booked or on the waiting list."""
    is_user_present = parse_int(lesson.get('IsUserPresent'), 0) == 1 or lesson.get('IsUserPresent') is True
    waiting_list_position = parse_int(
        lesson.get('UserPositionWaitingList')
        if lesson.get('UserPositionWaitingList') is not None
        else lesson.get('WaitingListPosition'),
        0,
    )
    return is_user_present or waiting_list_position > 0


def find_matching_lesson(
    target_lessons: list[dict],
    desired_course: str,
    desired_start_time: str,
) -> dict | None:
    """Return the lesson matching the exact normalized course name and start time."""
    for item in target_lessons:
        service_desc = str(item.get('ServiceDescription') or '').strip().lower()
        start_time_obj = schedule.parse_api_time(item.get('StartTime'))
        if not start_time_obj:
            continue
        if service_desc != desired_course:
            continue
        if start_time_obj.isoformat(timespec='seconds') != desired_start_time:
            continue
        return item
    return None


def is_dry_run_env() -> bool:
    """Return True when DRY_RUN environment variable is truthy."""
    return str(os.getenv("DRY_RUN", "")).strip().lower() in {"1", "true", "yes", "on"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Book preferred gym classes for all configured users."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate booking without calling client.book() or modifying daily locks.",
    )
    return parser.parse_args(argv)


def main(dry_run: bool | None = None) -> None:
    effective_dry_run = is_dry_run_env() if dry_run is None else dry_run

    if not should_run_now():
        print('Skipping run: not after 07:00 Europe/Rome.')
        return

    if effective_dry_run:
        print('[DRY-RUN] Enabled: no bookings will be submitted and daily locks will not be modified.')

    storage = UserStorage()
    users = storage.list_users()
    if not users:
        print('No users found; nothing to do.')
        return

    crypto = CryptoUtils()
    run_date = run_date_today()

    for user in users:
        print(f'Processing user {user}')

        run_id = None
        if effective_dry_run:
            print(f'[DRY-RUN] Skipping daily booking lock for user {user.id} on {run_date}')
        else:
            acquired, run_id, status = storage.acquire_booking_lock(
                user_id=user.id,
                run_date=run_date,
                ttl_minutes=LOCK_TTL_MINUTES,
            )

            if not acquired:
                print(f'Skipping user {user.id}: lock not acquired (status={status})')
                continue

        try:
            print(f'Decrypting credentials for user {user.id}')
            password = crypto.decrypt(user.credentials.password)
            credentials = Credentials(
                username=user.credentials.username,
                password=password,
            )

            print(f'Logging in for user {user.id}')
            client = GymClient()
            client.login(credentials)

            start_dt, end_dt = schedule.get_booking_window(today=run_date)
            time_start_dt, time_end_dt = schedule.get_daily_time_window(today=run_date)
            target_date = end_dt.date()
            target_weekday = schedule.WEEKDAY_EN.get(target_date.weekday())

            print(f'Fetching available lessons for user {user.id}')
            response = client.list_with_mine(
                start_date=start_dt.isoformat(timespec='seconds'),
                end_date=end_dt.isoformat(timespec='seconds'),
                time_start=time_start_dt.isoformat(timespec='seconds'),
                time_end=time_end_dt.isoformat(timespec='seconds'),
                types=None,
            )

            items = response.get('Items', [])
            preferences = user.preferences.by_day or {}
            desired_slots = preferences.get(target_weekday, []) if target_weekday else []

            if not desired_slots:
                print(f'No preferences configured for {target_weekday} on user {user.id}')
                if not effective_dry_run:
                    storage.mark_booking_completed(user.id, run_date, run_id)
                continue

            target_lessons = []
            for item in items:
                if schedule.parse_api_date(item.get('DateLesson')) != target_date:
                    continue
                category = str(item.get('CategoryDescription') or '').strip()
                if category != 'CORSI FIT':
                    continue
                target_lessons.append(item)

            if not target_lessons:
                print(f'No lessons found on {target_date} for user {user.id}')
                if not effective_dry_run:
                    storage.mark_booking_completed(user.id, run_date, run_id)
                continue

            booking_errors: list[str] = []

            for slot in desired_slots:
                normalized_slot = normalize_preference_slot(slot)
                if not normalized_slot:
                    print(f'Skipping invalid preference slot for user {user.id}: {slot}')
                    continue

                desired_course, desired_start_time = normalized_slot
                lesson = find_matching_lesson(target_lessons, desired_course, desired_start_time)

                if not lesson:
                    print(
                        f'No exact lesson match for user {user.id} slot '
                        f'{desired_course} {desired_start_time} on {target_date}'
                    )
                    continue

                available_places = parse_int(lesson.get('AvailablePlaces'), 0)

                if is_lesson_already_booked(lesson):
                    print(
                        f'Skipping already booked slot for user {user.id}: '
                        f'{desired_course} {desired_start_time}'
                    )
                    continue

                if available_places <= 0:
                    print(
                        f'No available seats for user {user.id}: '
                        f'{desired_course} {desired_start_time}'
                    )
                    continue

                lesson_date = schedule.parse_api_date(lesson['DateLesson'])
                start_time_obj = schedule.parse_api_time(lesson['StartTime'])
                end_time_obj = schedule.parse_api_time(lesson['EndTime'])
                if not lesson_date or not start_time_obj or not end_time_obj:
                    print(f'Skipping lesson with invalid date/time for user {user.id}')
                    continue

                start_datetime = schedule.datetime.combine(lesson_date, start_time_obj)
                end_datetime = schedule.datetime.combine(lesson_date, end_time_obj)

                if effective_dry_run:
                    print(
                        f"[DRY-RUN] Would book lesson {lesson.get('IDLesson')} "
                        f"(service {lesson.get('IDServizio')}, {lesson.get('ServiceDescription')}) "
                        f'for user {user.id} on {start_datetime} - {end_datetime}'
                    )
                    continue

                print(
                    f"Attempting to book lesson {lesson.get('IDLesson')} for user {user.id} "
                    f'on {start_datetime}'
                )
                book_response = client.book(
                    booking_id=lesson['IDServizio'],
                    start_time=start_datetime.isoformat(timespec='seconds'),
                    end_time=end_datetime.isoformat(timespec='seconds'),
                    lesson_id=lesson['IDLesson'],
                )

                if book_response.get('Successful'):
                    print(
                        f"Booking successful for user {user.id} lesson {lesson.get('IDLesson')}"
                    )
                else:
                    err_msg = (
                        book_response.get('ErrorMessage')
                        or book_response.get('Comment')
                        or 'Booking unsuccessful'
                    )
                    print(
                        f"Booking failed for user {user.id} lesson {lesson.get('IDLesson')}: {err_msg}"
                    )
                    booking_errors.append(f"lesson {lesson.get('IDLesson')}: {err_msg}")

            if not effective_dry_run:
                if booking_errors:
                    storage.mark_booking_failed(
                        user_id=user.id,
                        run_date=run_date,
                        run_id=run_id,
                        error='; '.join(booking_errors),
                        retry_minutes=LOCK_RETRY_MINUTES,
                    )
                else:
                    storage.mark_booking_completed(user.id, run_date, run_id)

        except Exception as exc:
            print(f'Error processing user {user.id}: {exc}')
            if not effective_dry_run:
                storage.mark_booking_failed(
                    user_id=user.id,
                    run_date=run_date,
                    run_id=run_id,
                    error=str(exc),
                    retry_minutes=LOCK_RETRY_MINUTES,
                )


if __name__ == '__main__':
    args = parse_args()
    main(dry_run=args.dry_run or is_dry_run_env())
