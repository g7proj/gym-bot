"""
FastAPI backend for gym booking system.
Provides endpoints for user login verification and preference management.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
import uuid
from .models import PreferencesUpdate, User, UserCredentials, UserPreferences
from .storage import UserStorage
from utils.crypto import CryptoUtils
from src.gym_bot.client import GymClient, GymClientError
from src.gym_bot.config import Credentials

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
    
    Args:
        credentials: Username and password.
    
    Returns:
        Success message with user ID if login succeeds.
    
    Raises:
        HTTPException: If login fails.
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

@app.put("/users/{user_id}/preferences")
async def update_preferences(user_id: str, preferences: PreferencesUpdate):
    """
    Update course preferences for a user.
    
    Args:
        user_id: User identifier.
        preferences: New preferences.
    
    Returns:
        Success message.
    
    Raises:
        HTTPException: If user not found.
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
    
    Args:
        user_id: User identifier.
    
    Returns:
        User data.
    
    Raises:
        HTTPException: If user not found.
    """
    user = storage.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
