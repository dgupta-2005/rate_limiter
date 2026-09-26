from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.middleware import RateLimiterMiddleware, token_bucket, sliding_window
from typing import Optional

app = FastAPI(title="Rate Limiter Core")

# Enable CORS for React frontend (allow exposed headers so frontend can read them)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"]
)

# Attach our custom rate limiter middleware
app.add_middleware(RateLimiterMiddleware)


class TokenBucketConfig(BaseModel):
    capacity: int
    refill_rate: float


class SlidingWindowConfig(BaseModel):
    limit: int
    window_seconds: float


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/ping")
def ping(x_algorithm: Optional[str] = Header(default="token_bucket", description="Choose: 'token_bucket' or 'sliding_window'")):
    return {
        "message": "pong",
        "algorithm_used": x_algorithm,
        "status": "Request permitted"}


@app.post("/api/config/token-bucket")
def update_token_bucket(config: TokenBucketConfig):
    token_bucket.capacity = config.capacity
    token_bucket.refill_rate = config.refill_rate
    return {"message": "Token bucket updated", "config": config}


@app.post("/api/config/sliding-window")
def update_sliding_window(config: SlidingWindowConfig):
    sliding_window.limit = config.limit
    sliding_window.window_seconds = config.window_seconds
    return {"message": "Sliding window updated", "config": config}