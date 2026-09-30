"""PathShala LLM backend: a small FastAPI service that proxies requests to OpenAI.

Your frontend calls this service; the OpenAI API key stays on the server.
"""

import json
import logging
import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import APIError, APIStatusError, AsyncOpenAI
from pydantic import BaseModel, Field

load_dotenv()  # reads backend/.env locally; on Render, env vars come from the dashboard

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
APP_API_KEY = os.getenv("APP_API_KEY")  # shared secret your frontend sends; unset = no auth
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "You are PathShala's assistant. Answer clearly and concisely.",
)

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is not set (add it to backend/.env or Render env vars)")

logger = logging.getLogger("pathshala")
logging.basicConfig(level=logging.INFO)

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

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
    messages = [{"role": "system", "content": req.system or SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]
    return {"model": MODEL, "messages": messages, "max_completion_tokens": req.max_tokens}


def to_http_error(e: APIError) -> HTTPException:
    # Log the real OpenAI error server-side; only a safe summary goes to the client.
    status = e.status_code if isinstance(e, APIStatusError) else None
    logger.error("OpenAI API error (status=%s): %s", status, e.message)
    if status == 429:
        return HTTPException(status_code=429, detail="LLM rate limit hit, try again shortly")
    if status in (401, 403):
        return HTTPException(status_code=500, detail="Server's OpenAI API key is invalid")
    if status == 400:
        return HTTPException(status_code=400, detail=str(e.message))
    if status == 404:
        return HTTPException(status_code=502, detail=f"Model '{MODEL}' not found or unavailable for this key")
    return HTTPException(status_code=502, detail=f"LLM provider error ({status}): {e.message}")


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
        response = await client.chat.completions.create(**build_request(req))
    except APIError as e:
        raise to_http_error(e)

    if not response.choices:
        raise HTTPException(status_code=422, detail="The model declined this request")

    choice = response.choices[0]
    usage = response.usage
    return ChatResponse(
        reply=choice.message.content or "",
        model=MODEL,
        finish_reason=choice.finish_reason,
        input_tokens=(usage and usage.prompt_tokens) or 0,
        output_tokens=(usage and usage.completion_tokens) or 0,
    )


@app.post("/chat/stream", dependencies=[Depends(check_api_key)])
async def chat_stream(req: ChatRequest):
    """Same as /chat, but streams text as Server-Sent Events (typewriter effect)."""

    async def events():
        try:
            stream = await client.chat.completions.create(**build_request(req), stream=True)
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield f"data: {json.dumps({'text': delta})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except APIError as e:
            yield f"data: {json.dumps({'error': to_http_error(e).detail})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
