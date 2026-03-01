"""Schemas for authentication endpoints."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = Field(default=None, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class DevLoginRequest(BaseModel):
    email: EmailStr = "aarav@demo.com"


class AuthUserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    role: str


class AuthResponse(BaseModel):
    user: AuthUserResponse
    message: str


class VoiceTokenResponse(BaseModel):
    token: str
    expires_in: int

