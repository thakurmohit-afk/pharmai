"""Voice service — OpenAI Whisper STT and ElevenLabs TTS."""

import io
import logging
from typing import AsyncGenerator

import httpx

from app.config import get_settings
from app.services.openai_client import get_async_openai_client

logger = logging.getLogger("pharmacy.services.voice")
settings = get_settings()


async def transcribe_audio(audio_bytes: bytes, filename: str) -> dict:
    """Transcribe audio via OpenAI Whisper API.

    Args:
        audio_bytes: Raw audio file bytes (webm, mp3, wav, etc.)
        filename: Original filename for content-type detection.

    Returns:
        dict with transcription text and metadata.
    """
    try:
        # Wrap bytes in a file-like object for the API
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        transcript = await get_async_openai_client(force_refresh=True).audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            language="en",  # can be extended for multilingual
        )

        return {
            "transcription": transcript.text,
            "language": getattr(transcript, "language", "en"),
            "duration": getattr(transcript, "duration", None),
            "success": True,
        }

    except Exception as e:
        logger.error(f"Whisper transcription error: {e}")
        return {
            "transcription": "",
            "error": str(e),
            "success": False,
        }


async def text_to_speech_stream(text: str) -> AsyncGenerator[bytes, None]:
    """Stream TTS audio from ElevenLabs API.

    Yields audio chunks as they arrive for low-latency playback.
    """
    if not settings.elevenlabs_api_key:
        logger.warning("ElevenLabs API key not configured, returning empty stream")
        return

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}/stream"
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes(chunk_size=4096):
                    yield chunk
    except Exception as e:
        logger.error(f"ElevenLabs TTS error: {e}")
