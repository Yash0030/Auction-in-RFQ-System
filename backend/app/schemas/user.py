from datetime import datetime
from pydantic import BaseModel, Field

class UserRegister(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str
    role: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
