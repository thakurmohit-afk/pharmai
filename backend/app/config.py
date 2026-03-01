"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv


class Settings(BaseSettings):
    """Central configuration loaded from .env or process environment."""

    # --- OpenAI ---
    openai_api_key: str = Field(default="", description="OpenAI API key for GPT-4, Whisper, Vision")
    gemini_api_key: str = Field(default="", description="Google Gemini API key for prescription OCR")

    # --- ElevenLabs ---
    elevenlabs_api_key: str = Field(default="", description="ElevenLabs API key for TTS")
    elevenlabs_voice_id: str = Field(default="21m00Tcm4TlvDq8ikWAM", description="ElevenLabs voice ID")
    elevenlabs_agent_id: str = Field(default="", description="ElevenLabs Conversational AI agent ID for refill calls")

    # --- LangFuse ---
    langfuse_public_key: str = Field(default="", description="LangFuse public key")
    langfuse_secret_key: str = Field(default="", description="LangFuse secret key")
    langfuse_host: str = Field(default="https://cloud.langfuse.com", description="LangFuse host URL")

    # --- Database ---
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/pharmacy_db",
        description="Async database connection string",
    )

    # --- Razorpay ---
    payment_enabled: bool = Field(default=False, description="Enable Razorpay payment flow")
    razorpay_key_id: str = Field(default="", description="Razorpay Key ID")
    razorpay_key_secret: str = Field(default="", description="Razorpay Key Secret")

    # --- Redis ---
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis connection URL")

    # --- n8n ---
    n8n_webhook_url: str = Field(default="", description="n8n webhook URL for order finalization")

    # --- Email (Gmail SMTP) ---
    smtp_email: str = Field(default="", description="Gmail address used to send notifications")
    smtp_app_password: str = Field(default="", description="Gmail App Password (not regular password)")
    smtp_host: str = Field(default="smtp.gmail.com", description="SMTP server host")
    smtp_port: int = Field(default=587, description="SMTP server port (587 for STARTTLS)")

    # --- Twilio (Outbound Refill Calls) ---
    twilio_account_sid: str = Field(default="", description="Twilio Account SID")
    twilio_auth_token: str = Field(default="", description="Twilio Auth Token")
    twilio_phone_number: str = Field(default="", description="Twilio phone number (E.164 format)")

    # --- Auth ---
    auth_enabled: bool = Field(default=True, description="Enable application auth")
    allow_demo_bypass: bool = Field(default=False, description="Enable dev-only demo login route")
    access_token_ttl_min: int = Field(default=15, description="Access token TTL in minutes")
    refresh_token_ttl_days: int = Field(default=14, description="Refresh token TTL in days")
    voice_token_ttl_sec: int = Field(default=3600, description="Voice auth token TTL in seconds")
    cookie_secure: bool = Field(default=False, description="Set auth cookies as secure")
    cookie_domain: str = Field(default="", description="Cookie domain override")
    cookie_samesite: str = Field(default="lax", description="Cookie samesite policy")

    # --- Memory ---
    chat_summary_refresh_turns: int = Field(
        default=6, description="Refresh long-term memory summary every N user turns"
    )
    chat_history_retention_days: int = Field(default=90, description="Conversation retention in days")

    # --- App ---
    app_env: str = Field(default="development")
    mock_mode: bool = Field(default=False, description="Use canned LLM responses for testing")
    sql_echo: bool = Field(
        default=False,
        description="Enable SQLAlchemy SQL echo logs (verbose, mostly for deep debugging)",
    )
    secret_key: str = Field(default="dev-secret-key-change-me")
    dev_cache_persist: bool = Field(
        default=False,
        description="Persist in-memory fallback cache to disk in development",
    )
    cache_namespace: str = Field(
        default="v1",
        description="Namespace prefix for cache keys to avoid stale collisions",
    )
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        description="Comma-separated CORS allowlist",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def cors_origins_list(self) -> list[str]:
        """Return a cleaned list of configured CORS origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cookie_samesite_value(self) -> str:
        value = self.cookie_samesite.strip().lower()
        if value not in {"lax", "strict", "none"}:
            return "lax"
        return value

    def validate_runtime(self) -> None:
        """Validate runtime-critical settings and fail fast on invalid config."""
        if not self.mock_mode and not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when MOCK_MODE=false.")

        if self.auth_enabled:
            if self.access_token_ttl_min <= 0:
                raise ValueError("ACCESS_TOKEN_TTL_MIN must be greater than 0.")
            if self.refresh_token_ttl_days <= 0:
                raise ValueError("REFRESH_TOKEN_TTL_DAYS must be greater than 0.")
            if self.app_env != "development" and len(self.secret_key or "") < 24:
                raise ValueError("SECRET_KEY must be at least 24 characters outside development.")

        if self.payment_enabled:
            missing = []
            if not self.razorpay_key_id:
                missing.append("RAZORPAY_KEY_ID")
            if not self.razorpay_key_secret:
                missing.append("RAZORPAY_KEY_SECRET")
            if missing:
                raise ValueError(
                    f"Payment is enabled but missing required settings: {', '.join(missing)}"
                )
            if not self.razorpay_key_id.startswith("rzp_test_"):
                raise ValueError(
                    "Only Razorpay test mode is allowed right now. "
                    "Use a key starting with 'rzp_test_'."
                )

        if not self.cors_origins_list:
            raise ValueError("CORS_ORIGINS must include at least one allowed origin.")

        if not self.cache_namespace.strip():
            raise ValueError("CACHE_NAMESPACE must not be empty.")


_settings: Settings | None = None


def _load_env_file_with_override() -> None:
    """Load backend/.env and override process env to avoid stale shell keys."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)


def get_settings(force_refresh: bool = False) -> Settings:
    """Return settings, with optional cache bypass.

    `force_refresh=True` re-reads `.env` and refreshes the singleton.
    """
    global _settings
    if force_refresh or _settings is None:
        _load_env_file_with_override()
        _settings = Settings()
        _settings.validate_runtime()
    return _settings
