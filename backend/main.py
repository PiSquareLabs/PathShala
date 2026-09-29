"""PathShala LLM backend: a small FastAPI service that proxies requests to Gemini.

Your frontend calls this service; the Gemini API key stays on the server.
"""

import json
import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

load_dotenv()  # reads backend/.env locally; on Render, env vars come from the dashboard

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
APP_API_KEY = os.getenv("APP_API_KEY")  # shared secret your frontend sends; unset = no auth
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "You are PathShala's assistant. Answer clearly and concisely.",
)

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set (add it to backend/.env or Render env vars)")

client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(title="PathShala LLM API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message] = Field(..., min_length=1)
    system: str | None = None
    max_tokens: int = Field(8192, ge=1, le=65536)


class ChatResponse(BaseModel):
    reply: str
    model: str
    finish_reason: str | None
    input_tokens: int
    output_tokens: int


def check_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if APP_API_KEY and x_api_key != APP_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")


def build_request(req: ChatRequest) -> dict:
    # Gemini calls the assistant role "model"
    contents = [
        types.Content(
            role="model" if m.role == "assistant" else "user",
            parts=[types.Part(text=m.content)],
        )
        for m in req.messages
    ]
    config = types.GenerateContentConfig(
        system_instruction=req.system or SYSTEM_PROMPT,
        max_output_tokens=req.max_tokens,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    return {"model": MODEL, "contents": contents, "config": config}


def to_http_error(e: errors.APIError) -> HTTPException:
    if e.code == 429:
        return HTTPException(status_code=429, detail="LLM rate limit hit, try again shortly")
    if e.code in (401, 403):
        return HTTPException(status_code=500, detail="Server's Gemini API key is invalid")
    if e.code == 400:
        return HTTPException(status_code=400, detail=str(e.message))
    return HTTPException(status_code=502, detail="LLM provider error")


@app.get("/")
async def root():
    return {"service": "PathShala LLM API", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL}


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(check_api_key)])
async def chat(req: ChatRequest):
    """Send a conversation and get the full reply back as JSON."""
    try:
        response = await client.aio.models.generate_content(**build_request(req))
    except errors.APIError as e:
        raise to_http_error(e)

    if not response.candidates:
        raise HTTPException(status_code=422, detail="The model declined this request")

    usage = response.usage_metadata
    finish = response.candidates[0].finish_reason
    return ChatResponse(
        reply=response.text or "",
        model=MODEL,
        finish_reason=finish.name if finish else None,
        input_tokens=(usage and usage.prompt_token_count) or 0,
        output_tokens=(usage and usage.candidates_token_count) or 0,
    )


@app.post("/chat/stream", dependencies=[Depends(check_api_key)])
async def chat_stream(req: ChatRequest):
    """Same as /chat, but streams text as Server-Sent Events (typewriter effect)."""

    async def events():
        try:
            stream = await client.aio.models.generate_content_stream(**build_request(req))
            async for chunk in stream:
                if chunk.text:
                    yield f"data: {json.dumps({'text': chunk.text})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except errors.APIError as e:
            yield f"data: {json.dumps({'error': to_http_error(e).detail})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
