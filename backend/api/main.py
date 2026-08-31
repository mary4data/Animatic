from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from agent.storage import STORAGE_ROOT  # noqa: E402
from api.routes import router  # noqa: E402

# ADK's default model client reads GOOGLE_API_KEY; we ask users for the more
# conventional GEMINI_API_KEY in .env.example and bridge it here so one key
# configures both the orchestrator's own model calls and our direct
# google-genai tool calls, instead of asking for the same key twice.
if os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Animatic API")

_default_origins = "http://localhost:8080,http://localhost:3000,http://localhost:5173,http://127.0.0.1:8080"
allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=STORAGE_ROOT), name="media")
app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
