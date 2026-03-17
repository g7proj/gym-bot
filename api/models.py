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
    """Course preferences."""
    days: List[str] = Field(default_factory=list, description="Preferred days")
    courses: List[str] = Field(default_factory=list, description="Preferred courses")

class User(BaseModel):
    """Complete user model."""
    id: str = Field(..., description="Unique user identifier")
    credentials: UserCredentials
    preferences: UserPreferences = Field(default_factory=UserPreferences, description="Course preferences")
    email: Optional[str] = Field(None, description="Optional email for notifications")