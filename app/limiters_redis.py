import time
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
        pipe.zremrangebyscore(key, 0, cutoff)          # Evict old entries
        pipe.zcard(key)                                # Count requests in current window
        _, current_count = pipe.execute()

        if current_count < self.limit:
            pipe = self.redis.pipeline()
            pipe.zadd(key, {str(now): now})            # Record request
            pipe.expire(key, int(self.window_seconds) + 1)  # Set TTL for cleanup
            pipe.execute()

            return True, {
                "algorithm": "redis_sliding_window",
                "limit": self.limit,
                "remaining": self.limit - (current_count + 1),
                "retry_after": 0
            }

        # Calculate time remaining until oldest entry drops out
        oldest = self.redis.zrange(key, 0, 0, withscores=True)
        retry_after = round((oldest[0][1] + self.window_seconds) - now, 2) if oldest else self.window_seconds

        return False, {
            "algorithm": "redis_sliding_window",
            "limit": self.limit,
            "remaining": 0,
            "retry_after": max(0.0, retry_after)
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

    if tokens == nil then
        tokens = capacity
        last_refill = now
    else
        local elapsed = now - last_refill
        tokens = math.min(capacity, tokens + (elapsed * refill_rate))
        last_refill = now
    end

    if tokens >= requested then
        tokens = tokens - requested
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
        redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) * 2)
        return {1, math.floor(tokens), 0}
    else
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
        local wait_time = (requested - tokens) / refill_rate
        return {0, math.floor(tokens), math.ceil(wait_time)}
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
        
        # Execute atomic Lua script
        allowed, remaining, wait_time = self.script(
            keys=[key],
            args=[self.capacity, self.refill_rate, now]
        )

        return bool(allowed), {
            "algorithm": "redis_token_bucket",
            "limit": self.capacity,
            "remaining": remaining,
            "retry_after": wait_time if not allowed else 0
        }