"""
Pydantic models for user data validation and serialization.
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class UserCredentials(BaseModel):
    """Gym portal credentials for a user."""
    username: str = Field(..., description="Gym portal username")
    password: str = Field(..., description="Plain password (will be encrypted on save)")

class UserPreferences(BaseModel):
    """Course preferences by weekday."""
    by_day: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Mapping of weekday (monday..sunday) to course keywords",
    )

class User(BaseModel):
    """Complete user model."""
    id: str = Field(..., description="Unique user identifier")
    credentials: UserCredentials
    preferences: UserPreferences = Field(default_factory=UserPreferences, description="Course preferences")
