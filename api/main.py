"""
FastAPI backend for gym booking system.
Provides endpoints for user login verification and preference management.
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import uuid
from .models import User, UserCredentials, UserPreferences
from .storage import UserStorage
from utils.crypto import CryptoUtils
from src.gym_bot.client import GymClient, GymClientError
from src.gym_bot.config import Credentials

app = FastAPI(title="Gym Booking API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-frontend-domain.com"],  # Update for production
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
        credentials: Username and password (password will be encrypted if successful).
    
    Returns:
        Success message with user ID if login succeeds.
    
    Raises:
        HTTPException: If login fails.
    """
    try:
        # Decrypt password for login attempt
        password = crypto.decrypt(credentials.password_encrypted)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Decryption failed: {e}")
    
    client = GymClient()
    try:
        creds = Credentials(username=credentials.username, password=password)
        client.login(creds)
    except GymClientError as e:
        raise HTTPException(status_code=401, detail=f"Login failed: {e}")
    
    # Generate user ID and save encrypted credentials
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        credentials=UserCredentials(
            username=credentials.username,
            password_encrypted=credentials.password_encrypted  # Already encrypted from frontend
        )
    )
    storage.save_user(user)
    
    return {"message": "Login successful", "user_id": user_id}

@app.put("/users/{user_id}/preferences")
async def update_preferences(user_id: str, preferences: UserPreferences):
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
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.preferences = preferences
    storage.save_user(user)
    return {"message": "Preferences updated"}

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