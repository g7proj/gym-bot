import base64
import contextlib
import io
import os
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from api.models import PreferenceSlot, User, UserCredentials, UserPreferences
from gym_bot import schedule
from scripts import book_all_users
from utils.crypto import CryptoUtils


class CryptoUtilsTests(unittest.TestCase):
    def test_encrypt_decrypt_roundtrip_without_secret_stdout(self):
        key = base64.b64encode(os.urandom(32)).decode()
        secret_password = "SuperSecretPassword!123"
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            crypto = CryptoUtils(key=key)
            encrypted = crypto.encrypt(secret_password)
            decrypted = crypto.decrypt(encrypted)

        self.assertEqual(decrypted, secret_password)
        output = buf.getvalue()
        self.assertNotIn(key, output)
        self.assertNotIn(secret_password, output)


class BookingLogicTests(unittest.TestCase):
    def test_find_matching_lesson_uses_exact_course_name(self):
        lessons = [
            {
                "IDLesson": 1,
                "ServiceDescription": "PILATES MAT",
                "StartTime": "1900-01-01T18:00:00",
            },
            {
                "IDLesson": 2,
                "ServiceDescription": "PILATES",
                "StartTime": "1900-01-01T18:00:00",
            },
        ]
        matched = book_all_users.find_matching_lesson(lessons, "pilates", "18:00:00")
        self.assertIsNotNone(matched)
        self.assertEqual(matched["IDLesson"], 2)

        missing = book_all_users.find_matching_lesson(lessons, "yoga", "18:00:00")
        self.assertIsNone(missing)

    def test_is_lesson_already_booked_checks_user_position_waiting_list(self):
        self.assertTrue(
            book_all_users.is_lesson_already_booked(
                {"IsUserPresent": 0, "UserPositionWaitingList": 2}
            )
        )
        self.assertTrue(
            book_all_users.is_lesson_already_booked(
                {"IsUserPresent": 1, "UserPositionWaitingList": 0}
            )
        )
        self.assertTrue(
            book_all_users.is_lesson_already_booked(
                {"IsUserPresent": False, "WaitingListPosition": 1}
            )
        )
        self.assertFalse(
            book_all_users.is_lesson_already_booked(
                {"IsUserPresent": 0, "UserPositionWaitingList": 0}
            )
        )

    def test_booking_window_uses_explicit_today(self):
        start_dt, end_dt = schedule.get_booking_window(today=date(2026, 5, 1))
        self.assertEqual(start_dt.date(), date(2026, 5, 1))
        self.assertEqual(end_dt.date(), date(2026, 5, 20))

    def test_main_marks_failed_when_book_returns_unsuccessful(self):
        target_date = date(2026, 5, 20)
        target_weekday = schedule.WEEKDAY_EN[target_date.weekday()]
        key = base64.b64encode(os.urandom(32)).decode()
        encrypted_pw = CryptoUtils(key=key).encrypt("gympass")

        user = User(
            id="user-1",
            credentials=UserCredentials(username="mario", password=encrypted_pw),
            preferences=UserPreferences(
                by_day={
                    target_weekday: [
                        PreferenceSlot(course="pilates", lesson_start_time="18:00:00")
                    ]
                }
            ),
        )

        mock_storage = MagicMock()
        mock_storage.list_users.return_value = [user]
        mock_storage.acquire_booking_lock.return_value = (True, "run-1", "in_progress")

        mock_client = MagicMock()
        mock_client.list_with_mine.return_value = {
            "Items": [
                {
                    "IDLesson": 101,
                    "IDServizio": 55,
                    "DateLesson": "2026-05-20T00:00:00",
                    "StartTime": "1900-01-01T18:00:00",
                    "EndTime": "1900-01-01T19:00:00",
                    "CategoryDescription": "CORSI FIT",
                    "ServiceDescription": "PILATES",
                    "AvailablePlaces": 5,
                    "IsUserPresent": 0,
                    "UserPositionWaitingList": 0,
                }
            ]
        }
        mock_client.book.return_value = {
            "Successful": False,
            "ErrorMessage": "Temporary failure",
        }

        with (
            patch.dict(os.environ, {"ENCRYPTION_KEY": key}),
            patch.object(book_all_users, "should_run_now", return_value=True),
            patch.object(book_all_users, "run_date_today", return_value=date(2026, 5, 1)),
            patch.object(book_all_users, "UserStorage", return_value=mock_storage),
            patch.object(book_all_users, "GymClient", return_value=mock_client),
        ):
            book_all_users.main()

        mock_storage.mark_booking_failed.assert_called_once()
        mock_storage.mark_booking_completed.assert_not_called()


if __name__ == "__main__":
    unittest.main()
