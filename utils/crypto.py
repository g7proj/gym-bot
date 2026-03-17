"""
Cryptography utilities for encrypting/decrypting sensitive data like passwords.
Uses Fernet (symmetric encryption) for reversible encryption.
"""
from cryptography.fernet import Fernet
import os
from typing import Optional

class CryptoUtils:
    """
    Handles encryption and decryption of sensitive strings using a symmetric key.
    """
    
    def __init__(self, key: Optional[str] = None):
        """
        Initialize with encryption key. If not provided, uses environment variable.
        
        Args:
            key: Base64-encoded Fernet key. Defaults to ENCRYPTION_KEY env var.
        """
        self.key = key or os.getenv("ENCRYPTION_KEY")
        if not self.key:
            raise ValueError("ENCRYPTION_KEY environment variable not set")
        self.fernet = Fernet(self.key.encode())
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a plaintext string.
        
        Args:
            plaintext: String to encrypt.
        
        Returns:
            Base64-encoded encrypted string.
        """
        return self.fernet.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, encrypted: str) -> str:
        """
        Decrypt an encrypted string.
        
        Args:
            encrypted: Base64-encoded encrypted string.
        
        Returns:
            Decrypted plaintext string.
        """
        return self.fernet.decrypt(encrypted.encode()).decode()