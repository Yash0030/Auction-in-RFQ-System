import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres@localhost:5432/rfq_auction")
JWT_SECRET = os.getenv("JWT_SECRET", "supersecretkey1234567890abcdef")
PORT = int(os.getenv("PORT", "8000"))

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
CORS_ORIGINS = ["*"]
