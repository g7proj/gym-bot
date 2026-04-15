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


def main() -> None:
    if not should_run_now():
        print('Skipping run: not after 07:00 Europe/Rome.')
        return

    storage = UserStorage()
    users = storage.list_users()
    if not users:
        print('No users found; nothing to do.')
        return

    crypto = CryptoUtils()
    run_date = run_date_today()

    for user in users:
        print(f'Processing user {user}')

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
            print(f'User {user.id} has username: {user.credentials.username}')
            password = crypto.decrypt(user.credentials.password)
            print(f'Creating credentials object for user {user.id}')
            credentials = Credentials(
                username=user.credentials.username,
                password=password,
            )

            print(f'Logging in for user {user.id}')
            client = GymClient()
            client.login(credentials)

            start_dt, end_dt = schedule.get_booking_window()
            time_start_dt, time_end_dt = schedule.get_daily_time_window()
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
                storage.mark_booking_completed(user.id, run_date, run_id)
                continue

            for slot in desired_slots:
                normalized_slot = normalize_preference_slot(slot)
                if not normalized_slot:
                    print(f'Skipping invalid preference slot for user {user.id}: {slot}')
                    continue

                desired_course, desired_start_time = normalized_slot
                matching = []
                for item in target_lessons:
                    service_desc = str(item.get('ServiceDescription') or '').lower()
                    start_time_obj = schedule.parse_api_time(item.get('StartTime'))
                    if not start_time_obj:
                        continue
                    if desired_course not in service_desc:
                        continue
                    if start_time_obj.isoformat(timespec='seconds') != desired_start_time:
                        continue
                    matching.append(item)

                if not matching:
                    print(
                        f'No exact lesson match for user {user.id} slot '
                        f'{desired_course} {desired_start_time} on {target_date}'
                    )
                    continue

                lesson = matching[0]
                available_places = int(lesson.get('AvailablePlaces', 0) or 0)
                waiting_list_position = int(lesson.get('WaitingListPosition', 0) or 0)
                is_user_present = bool(lesson.get('IsUserPresent'))

                if is_user_present or waiting_list_position > 0:
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
                    print(
                        f"Booking failed for user {user.id} lesson {lesson.get('IDLesson')}"
                    )

            storage.mark_booking_completed(user.id, run_date, run_id)

        except Exception as exc:
            print(f'Error processing user {user.id}: {exc}')
            storage.mark_booking_failed(
                user_id=user.id,
                run_date=run_date,
                run_id=run_id,
                error=str(exc),
                retry_minutes=LOCK_RETRY_MINUTES,
            )


if __name__ == '__main__':
    main()
