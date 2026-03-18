"""
FastAPI backend for gym booking system.
Provides endpoints for user login verification and preference management.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from typing import Dict, List
from .models import PreferencesUpdate, User, UserCredentials
from .storage import UserStorage
from utils.crypto import CryptoUtils
from src.gym_bot.client import GymClient, GymClientError
from src.gym_bot.config import Credentials
from src.gym_bot import schedule

app = FastAPI(title="Gym Booking API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "https://g7proj.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = UserStorage()
crypto = CryptoUtils()

@app.get("/wake", response_class=PlainTextResponse)
async def wake() -> str:
    return "Ok"

@app.post("/login", response_model=dict)
async def login(credentials: UserCredentials):
    """
    Verify gym credentials by attempting login.
    """
    client = GymClient()
    try:
        creds = Credentials(username=credentials.username, password=credentials.password)
        client.login(creds)
    except GymClientError as e:
        raise HTTPException(status_code=401, detail=f"Login failed: {e}")

    encrypted_password = crypto.encrypt(credentials.password)
    user = storage.upsert_user(credentials.username, encrypted_password)

    return {"message": "Login successful", "user_id": user.id}

@app.get("/users/{user_id}/courses", response_model=dict)
async def get_courses(user_id: str, include_weekend: bool = False):
    """
    Return available courses for the current week, grouped by weekday.
    """
    user = storage.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    client = GymClient()
    try:
        password = crypto.decrypt(user.credentials.password)
        creds = Credentials(username=user.credentials.username, password=password)
        client.login(creds)
    except GymClientError as e:
        raise HTTPException(status_code=401, detail=f"Login failed: {e}")

    start_dt, end_dt = schedule.get_week_window()
    time_start_dt, time_end_dt = schedule.get_daily_time_window()

    try:
        response = client.list_with_mine(
            start_date=start_dt.isoformat(timespec="seconds"),
            end_date=end_dt.isoformat(timespec="seconds"),
            time_start=time_start_dt.isoformat(timespec="seconds"),
            time_end=time_end_dt.isoformat(timespec="seconds"),
            types=None,
        )
    except GymClientError as e:
        raise HTTPException(status_code=502, detail=f"Failed to load courses: {e}")

    items = response.get("Items") or []
    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail="Lessons response not in expected format")

    by_day: Dict[str, List[str]] = {}
    for item in items:
        date_lesson_str = item.get("DateLesson")
        service_desc = (item.get("ServiceDescription") or "").strip()
        if not date_lesson_str or not service_desc:
            continue

        d = schedule.parse_api_date(date_lesson_str)
        if d is None:
            continue

        weekday_name = schedule.WEEKDAY_EN.get(d.weekday())
        if not weekday_name:
            continue

        if not include_weekend and weekday_name in {"saturday", "sunday"}:
            continue

        key = weekday_name
        by_day.setdefault(key, [])
        normalized = service_desc.lower()
        if normalized not in by_day[key]:
            by_day[key].append(normalized)

    # Sort for stable UI
    for day in by_day:
        by_day[day] = sorted(by_day[day])

    return {"by_day": by_day}

@app.put("/users/{user_id}/preferences")
async def update_preferences(user_id: str, preferences: PreferencesUpdate):
    """
    Update course preferences for a user.
    """
    user = storage.get_user(user_id)
    if not user and preferences.username:
        user = storage.get_user_by_username(preferences.username)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    storage.save_preferences(user.id, preferences.by_day)
    return {"message": "Preferences updated", "user_id": user.id}

@app.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    """
    Get user data (without sensitive credentials).
    """
    user = storage.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
