"""Lazily-constructed, cached API clients, read from env at call time.

get_vertex_client() is unused by the current tools but kept available: it
was the original path for Imagen 3 storyboard generation, dropped in favor
of Gemini's own native image models (see clients.gemini_image_model() and
agent/tools/generate_storyboard.py) after Imagen 3 turned out to need
separate allowlisting this project doesn't have, and Gemini's image models
worked immediately through the same Developer API key already in use for
text/TTS -- one fewer credential path (no Vertex/ADC) to keep working.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Bounds how many Gemini calls (across all tools -- text, image, TTS) run at
# once. call_gemini_with_retry's own to_thread offload plus the tools'
# asyncio.gather usage (per-scene images, per-scene voice lines) means a
# single scene can otherwise burst 5-10+ simultaneous requests at the same
# per-minute-per-model quota (free-tier keys can be as low as 10 req/min for
# a given model, e.g. the TTS preview model) -- capping concurrency keeps
# a burst from instantly blowing through that, on top of the 429 retry below.
_GEMINI_MAX_CONCURRENCY = int(os.environ.get("GEMINI_MAX_CONCURRENCY", "4"))
_gemini_semaphore = asyncio.Semaphore(_GEMINI_MAX_CONCURRENCY)


def _rate_limit_retry_delay(exc: Any) -> float | None:
    """Google's 429 body includes a RetryInfo.retryDelay (e.g. "15s") telling
    us exactly how long to wait -- prefer that over guessing."""
    details = getattr(exc, "details", None) or {}
    if "error" in details:
        details = details["error"]
    for item in details.get("details") or []:
        if str(item.get("@type", "")).endswith("RetryInfo"):
            raw = str(item.get("retryDelay", "")).rstrip("s")
            try:
                return float(raw)
            except ValueError:
                return None
    return None


@functools.lru_cache(maxsize=1)
def get_genai_client():
    from google import genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set (see backend/.env.example)")
    return genai.Client(api_key=api_key)


@functools.lru_cache(maxsize=1)
def get_vertex_client():
    from google import genai

    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set (see backend/.env.example)")
    return genai.Client(vertexai=True, project=project, location=location)


@functools.lru_cache(maxsize=1)
def get_parallel_client():
    from parallel import Parallel

    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        raise RuntimeError("PARALLEL_API_KEY is not set (see backend/.env.example)")
    return Parallel(api_key=api_key)


def gemini_text_model() -> str:
    # gemini-2.5-flash returns 404 for new API keys (deprecated) -- the
    # "-latest" alias self-updates as Google rotates models, avoiding this
    # happening again.
    return os.environ.get("GEMINI_TEXT_MODEL", "gemini-flash-latest")


def gemini_tts_model() -> str:
    return os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")


def imagen_model() -> str:
    return os.environ.get("IMAGEN_MODEL", "imagen-3.0-generate-002")


def gemini_image_model() -> str:
    return os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")


# google-genai's own SDK already retries a call a couple of times internally
# (via tenacity) before raising, but on a 503 "high demand" spike that's often
# not long enough -- the couple of retries land inside the same brief window
# of overload. This wraps a call with a few more attempts at wider spacing
# (5s, 15s, 30s) so a run rides out a transient spike instead of failing the
# whole scene/job over it. Also retries 429 (rate limit / quota exhausted),
# using the server's own suggested retryDelay when present since that's a
# hard "wait exactly this long" instruction, not a guess. Anything else
# (400s, auth errors, etc.) fails immediately since retrying won't help.
async def call_gemini_with_retry(fn: Callable[..., Any], *args, **kwargs) -> Any:
    from google.genai import errors

    delays = (5, 15, 30)
    for attempt, delay in enumerate((*delays, None), start=1):
        try:
            async with _gemini_semaphore:
                return await asyncio.to_thread(fn, *args, **kwargs)
        except errors.ServerError as exc:
            if delay is None:
                raise
            logger.warning(
                "Gemini call hit a transient server error (attempt %d/%d), retrying in %ds: %s",
                attempt,
                len(delays) + 1,
                delay,
                exc,
            )
            await asyncio.sleep(delay)
        except errors.ClientError as exc:
            if exc.code != 429 or delay is None:
                raise
            wait = _rate_limit_retry_delay(exc) or delay
            logger.warning(
                "Gemini call hit a rate limit (attempt %d/%d), retrying in %.1fs: %s",
                attempt,
                len(delays) + 1,
                wait,
                exc,
            )
            await asyncio.sleep(wait)
