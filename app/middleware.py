import os
import redis
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.limiters_redis import RedisSlidingWindowLimiter, RedisTokenBucketLimiter

# Load environment variables from .env
load_dotenv()

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise ValueError("REDIS_URL is missing. Please set it in your .env file.")

# Initialize Upstash Redis TCP client
redis_client = redis.Redis.from_url(
    redis_url,
    decode_responses=True,
    ssl_cert_reqs=None  # Ensures smooth SSL handshake with Upstash
)

# Initialize the limiters (Default: 5 requests / 5 seconds)
token_bucket = RedisTokenBucketLimiter(redis_client=redis_client, capacity=5, refill_rate=1.0)
sliding_window = RedisSlidingWindowLimiter(redis_client=redis_client, limit=5, window_seconds=5.0)


class RateLimiterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # 1. Skip rate limiting for docs, schema, and health checks
        if (
            request.method == "OPTIONS"
            or request.url.path in ["/docs", "/openapi.json", "/health", "/favicon.ico"]
            or request.url.path.startswith("/api/config")
        ):
            return await call_next(request)
        # 2. Extract Client Identifier (API Key header or client IP)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"

        client_id = request.headers.get("X-API-Key", client_ip)

        # 3. Choose algorithm via header (default: token_bucket)
        algo_header = request.headers.get("X-Algorithm", "token_bucket").lower()
        limiter = sliding_window if algo_header == "sliding_window" else token_bucket

        # 4. Check Redis-backed limiter
        try:
            allowed, meta = limiter.allow_request(client_id)
        except Exception as e:
            # If Redis connection temporarily fails, fail-open or log error
            print(f"Redis rate limiting error: {e}")
            return await call_next(request)

        # 5. Handle rate limit exceeded (HTTP 429)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too Many Requests",
                    "algorithm": meta.get("algorithm"),
                    "retry_after_seconds": meta.get("retry_after")
                },
                headers={
                    "X-RateLimit-Limit": str(meta.get("limit")),
                    "X-RateLimit-Remaining": str(meta.get("remaining")),
                    "Retry-After": str(meta.get("retry_after")),
                }
            )

        # 6. Proceed with request and attach tracking headers
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(meta.get("limit"))
        response.headers["X-RateLimit-Remaining"] = str(meta.get("remaining"))
        return response