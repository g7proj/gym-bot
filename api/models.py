"""
Pydantic models for user data validation and serialization.
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class UserCredentials(BaseModel):
    """Gym portal credentials for a user."""
    username: str = Field(..., description="Gym portal username")
    password: str = Field(..., description="Plain password (will be encrypted on save)")

class PreferenceSlot(BaseModel):
    """Single weekly lesson slot preference."""
    course: str = Field(..., description="Normalized course keyword")
    lesson_start_time: str = Field(..., description="Lesson start time in HH:MM:SS")

class UserPreferences(BaseModel):
    """Lesson-slot preferences by weekday."""
    by_day: Dict[str, List[PreferenceSlot]] = Field(
        default_factory=dict,
        description="Mapping of weekday (monday..sunday) to preferred lesson slots",
    )

class PreferencesUpdate(BaseModel):
    """Update payload for user preferences."""
    by_day: Dict[str, List[PreferenceSlot]] = Field(
        default_factory=dict,
        description="Mapping of weekday (monday..sunday) to preferred lesson slots",
    )
    username: Optional[str] = Field(
        None,
        description="Gym portal username (used to resolve existing users)",
    )

class User(BaseModel):
    """Complete user model."""
    id: str = Field(..., description="Unique user identifier")
    credentials: UserCredentials
    preferences: UserPreferences = Field(default_factory=UserPreferences, description="Course preferences")

    def __str__(self):
        return f"User(id={self.id}, username={self.credentials.username}) Preferences: {self.preferences.by_day}"
