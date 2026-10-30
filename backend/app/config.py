"""Application configuration via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration loaded from environment variables."""

    APP_NAME: str = "Red Team Orchestration Portal"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://redteam:redteam@localhost:5432/redteam"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth / JWT
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Orchestrator
    ANTHROPIC_API_KEY: str = ""
    ORCHESTRATOR_MODEL: str = "claude-sonnet-5-5"

    # Approval auto-approve timeout (seconds) for Tier 0 (PASSIVE) actions
    TIER0_AUTO_APPROVE_SECONDS: int = 300

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
