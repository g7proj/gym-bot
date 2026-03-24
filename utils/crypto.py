"""
Cryptography utilities for encrypting/decrypting sensitive data like passwords.
Uses AES-GCM (symmetric encryption) for reversible encryption.
"""
import base64
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class CryptoUtils:
    """
    Handles encryption and decryption of sensitive strings using a symmetric key.
    """
    
    def __init__(self, key: Optional[str] = None):
        """
        Initialize with encryption key. If not provided, uses environment variable.

        Args:
            key: Base64-encoded 32-byte key. Defaults to ENCRYPTION_KEY env var.
        """
        self.key = key or os.getenv("ENCRYPTION_KEY")
        if not self.key:
            raise ValueError("ENCRYPTION_KEY environment variable not set")
        raw = base64.b64decode(self.key)
        if len(raw) != 32:
            raise ValueError("ENCRYPTION_KEY must be 32 bytes base64-encoded")
        self.aesgcm = AESGCM(raw)
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a plaintext string.
        
        Args:
            plaintext: String to encrypt.
        
        Returns:
            Base64-encoded encrypted string.
        """
        iv = os.urandom(12)
        ciphertext = self.aesgcm.encrypt(iv, plaintext.encode(), None)
        payload = iv + ciphertext
        return base64.b64encode(payload).decode()
    
    def decrypt(self, encrypted: str) -> str:
        """
        Decrypt an encrypted string.
        
        Args:
            encrypted: Base64-encoded encrypted string.
        
        Returns:
            Decrypted plaintext string.
        """
        payload = base64.b64decode(encrypted)
        if len(payload) <= 12:
            raise ValueError("Encrypted payload is invalid")
        iv = payload[:12]
        ciphertext = payload[12:]
        return self.aesgcm.decrypt(iv, ciphertext, None).decode()
