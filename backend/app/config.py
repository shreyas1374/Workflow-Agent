import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Automatically locate .env.local or .env from root or backend directory
parent_env_local = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))
backend_env_local = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
backend_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))

if os.path.exists(parent_env_local):
    load_dotenv(parent_env_local)
elif os.path.exists(backend_env_local):
    load_dotenv(backend_env_local)
elif os.path.exists(parent_env):
    load_dotenv(parent_env)
elif os.path.exists(backend_env):
    load_dotenv(backend_env)

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    # LLM_PROVIDER: "groq" | "nvidia" | "gemini" | "openrouter" — controls which API is used
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq")
    # Stub mode: set to true to skip real API calls (used in tests)
    LLM_STUB_MODE: bool = os.getenv("LLM_STUB_MODE", "false").lower() in ("true", "1", "yes")
    HTTP_STUB_MODE: bool = os.getenv("HTTP_STUB_MODE", "false").lower() in ("true", "1", "yes")

settings = Settings()
