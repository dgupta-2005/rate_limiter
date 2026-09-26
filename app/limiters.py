import time
from collections import deque
from threading import Lock


class TokenBucketLimiter:
    """
    Capacity: Max tokens stored in the bucket.
    Refill Rate: Tokens added per second.
    """
    def __init__(self, capacity: int = 10, refill_rate: float = 2.0):
        self.capacity = capacity
        self.refill_rate = refill_rate
        # Store state per client: {client_id: {"tokens": float, "last_refill": float}}
        self.buckets: dict[str, dict] = {}
        self.lock = Lock()

    def allow_request(self, client_id: str) -> tuple[bool, dict]:
        with self.lock:
            now = time.monotonic()

            if client_id not in self.buckets:
                self.buckets[client_id] = {
                    "tokens": float(self.capacity),
                    "last_refill": now
                }

            bucket = self.buckets[client_id]
            elapsed = now - bucket["last_refill"]
            bucket["tokens"] = min(
                float(self.capacity),
                bucket["tokens"] + (elapsed * self.refill_rate)
            )
            bucket["last_refill"] = now

            if bucket["tokens"] >= 1.0:
                bucket["tokens"] -= 1.0
                allowed = True
            else:
                allowed = False

            metadata = {
                "algorithm": "token_bucket",
                "limit": self.capacity,
                "remaining": int(bucket["tokens"]),
                "retry_after": round((1.0 - bucket["tokens"]) / self.refill_rate, 2) if not allowed else 0
            }
            return allowed, metadata


class SlidingWindowLogLimiter:
    """
    Limit: Max requests allowed within window_seconds.
    Window Seconds: Rolling window interval.
    """
    def __init__(self, limit: int = 10, window_seconds: float = 60.0):
        self.limit = limit
        self.window_seconds = window_seconds
        # Store timestamps per client: {client_id: deque([timestamp1, timestamp2, ...])}
        self.logs: dict[str, deque] = {}
        self.lock = Lock()

    def allow_request(self, client_id: str) -> tuple[bool, dict]:
        with self.lock:
            now = time.time()
            cutoff = now - self.window_seconds

            if client_id not in self.logs:
                self.logs[client_id] = deque()

            log = self.logs[client_id]

            # Discard timestamps that fell outside the rolling window
            while log and log[0] <= cutoff:
                log.popleft()

            if len(log) < self.limit:
                log.append(now)
                allowed = True
            else:
                allowed = False

            oldest = log[0] if log else now
            reset_time = max(0.0, round((oldest + self.window_seconds) - now, 2))

            metadata = {
                "algorithm": "sliding_window_log",
                "limit": self.limit,
                "remaining": max(0, self.limit - len(log)),
                "retry_after": reset_time if not allowed else 0
            }
            return allowed, metadata