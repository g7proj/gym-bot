"""
JSON-based storage for users. Easily replaceable with SQLite later.
"""
import json
import os
from typing import Dict, List, Optional
from .models import User

class UserStorage:
    """
    Handles loading and saving users to a JSON file.
    """
    
    def __init__(self, file_path: str = "data/users.json"):
        """
        Initialize storage with file path.
        
        Args:
            file_path: Path to JSON file.
        """
        self.file_path = file_path
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    def load_users(self) -> Dict[str, User]:
        """
        Load all users from JSON file.
        
        Returns:
            Dict of user_id -> User objects.
        """
        if not os.path.exists(self.file_path):
            return {}
        with open(self.file_path, "r") as f:
            data = json.load(f)
        return {user_id: User(**user_data) for user_id, user_data in data.items()}
    
    def save_users(self, users: Dict[str, User]) -> None:
        """
        Save all users to JSON file.
        
        Args:
            users: Dict of user_id -> User objects.
        """
        data = {user_id: user.dict() for user_id, user in users.items()}
        with open(self.file_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def get_user(self, user_id: str) -> Optional[User]:
        """
        Get a specific user by ID.
        
        Args:
            user_id: User identifier.
        
        Returns:
            User object or None if not found.
        """
        users = self.load_users()
        return users.get(user_id)

    def get_user_by_username(self, username: str) -> Optional[User]:
        """
        Find a user by gym portal username.
        """
        users = self.load_users()
        for user in users.values():
            if user.credentials.username == username:
                return user
        return None
    
    def save_user(self, user: User) -> None:
        """
        Save or update a single user.
        
        Args:
            user: User object to save.
        """
        users = self.load_users()
        users[user.id] = user
        self.save_users(users)
