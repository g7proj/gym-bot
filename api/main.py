"""
FastAPI backend for gym booking system.
Provides endpoints for user login verification and preference management.
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
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
    
    # Generate or reuse user ID and save encrypted credentials
    existing_user = storage.get_user_by_username(credentials.username)
    user_id = existing_user.id if existing_user else str(uuid.uuid4())
    encrypted_password = crypto.encrypt(credentials.password)
    user = User(
        id=user_id,
        credentials=UserCredentials(
            username=credentials.username,
            password=encrypted_password
        ),
        preferences=existing_user.preferences if existing_user else UserPreferences(),
    )
    storage.save_user(user)
    
    return {"message": "Login successful", "user_id": user_id}

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

    user.preferences = UserPreferences(by_day=preferences.by_day)
    storage.save_user(user)
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
