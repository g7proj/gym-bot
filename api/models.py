"""
Pydantic models for user data validation and serialization.
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class UserCredentials(BaseModel):
    """Gym portal credentials for a user."""
    username: str = Field(..., description="Gym portal username")
    password_encrypted: str = Field(..., description="Encrypted password")

class UserPreferences(BaseModel):
    """Course preferences by day of the week."""
    monday: List[str] = Field(default_factory=list, description="Courses for Monday")
    tuesday: List[str] = Field(default_factory=list, description="Courses for Tuesday")
    wednesday: List[str] = Field(default_factory=list, description="Courses for Wednesday")
    thursday: List[str] = Field(default_factory=list, description="Courses for Thursday")
    friday: List[str] = Field(default_factory=list, description="Courses for Friday")
    saturday: List[str] = Field(default_factory=list, description="Courses for Saturday")
    sunday: List[str] = Field(default_factory=list, description="Courses for Sunday")

class User(BaseModel):
    """Complete user model."""
    id: str = Field(..., description="Unique user identifier")
    credentials: UserCredentials
    preferences: UserPreferences = Field(default_factory=UserPreferences, description="Course preferences")
    email: Optional[str] = Field(None, description="Optional email for notifications")