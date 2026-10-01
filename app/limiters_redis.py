import time
import math
import redis


class RedisSlidingWindowLimiter:
    """
    Sliding Window Log implemented atomically using Redis Sorted Sets (ZSET).
    Key: "rl:sw:<client_id>"
    Score: Unix timestamp (float)
    Member: Unique timestamp string
    """
    def __init__(self, redis_client: redis.Redis, limit: int = 5, window_seconds: float = 5.0):
        self.redis = redis_client
        self.limit = limit
        self.window_seconds = window_seconds

    def allow_request(self, client_id: str) -> tuple[bool, dict]:
        key = f"rl:sw:{client_id}"
        now = time.time()
        cutoff = now - self.window_seconds

        # Run multi-command pipeline atomically
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, current_count = pipe.execute()

        if current_count < self.limit:
            pipe = self.redis.pipeline()
            pipe.zadd(key, {f"{now}:{time.perf_counter_ns()}": now})
            pipe.expire(key, int(self.window_seconds) + 2)
            pipe.execute()

            return True, {
                "algorithm": "redis_sliding_window",
                "limit": self.limit,
                "remaining": max(0, self.limit - (current_count + 1)),
                "retry_after": 0
            }

        # Calculate time remaining until oldest entry drops out
        oldest = self.redis.zrange(key, 0, 0, withscores=True)
        if oldest:
            oldest_time = oldest[0][1]
            retry_after = max(1.0, round((oldest_time + self.window_seconds) - now, 2))
        else:
            retry_after = float(self.window_seconds)

        return False, {
            "algorithm": "redis_sliding_window",
            "limit": self.limit,
            "remaining": 0,
            "retry_after": retry_after
        }


class RedisTokenBucketLimiter:
    """
    Token Bucket implemented atomically using a Redis Lua script to avoid race conditions.
    """
    LUA_SCRIPT = """
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local requested = 1

    local data = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(data[1])
    local last_refill = tonumber(data[2])

    if not tokens or not last_refill then
        tokens = capacity
        last_refill = now
    else
        local elapsed = math.max(0, now - last_refill)
        tokens = math.min(capacity, tokens + (elapsed * refill_rate))
        last_refill = now
    end

    if tokens >= requested then
        tokens = tokens - requested
        redis.call('HMSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(last_refill))
        redis.call('EXPIRE', key, math.max(10, math.ceil(capacity / refill_rate) * 2))
        return {1, math.floor(tokens), 0}
    else
        redis.call('HMSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(last_refill))
        local needed = requested - tokens
        local wait_time = math.max(1, math.ceil(needed / refill_rate))
        redis.call('EXPIRE', key, wait_time * 2)
        return {0, 0, wait_time}
    end
    """

    def __init__(self, redis_client: redis.Redis, capacity: int = 5, refill_rate: float = 1.0):
        self.redis = redis_client
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.script = self.redis.register_script(self.LUA_SCRIPT)

    def allow_request(self, client_id: str) -> tuple[bool, dict]:
        key = f"rl:tb:{client_id}"
        now = time.time()

        allowed_int, remaining, wait_time = self.script(
            keys=[key],
            args=[self.capacity, self.refill_rate, now]
        )

        is_allowed = bool(allowed_int == 1)

        return is_allowed, {
            "algorithm": "redis_token_bucket",
            "limit": self.capacity,
            "remaining": int(remaining),
            "retry_after": int(wait_time) if not is_allowed else 0
        }