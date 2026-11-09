# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Small fixed-window rate limiter.

Kept in memory, so it is correct for ONE server process (the production compose file runs exactly one).
If you ever run several workers or servers, move this to Redis.
"""
import time
from collections import defaultdict

from fastapi import HTTPException, status

_ALL: list["RateLimiter"] = []


class RateLimiter:
    def __init__(self, max_hits: int, window_seconds: int, message: str):
        self.max_hits, self.window, self.message = max_hits, window_seconds, message
        self.hits: dict[str, list[float]] = defaultdict(list)
        _ALL.append(self)

    def _recent(self, key: str) -> list[float]:
        now = time.time()
        self.hits[key] = [t for t in self.hits[key] if now - t < self.window]
        if len(self.hits) > 10_000:  # keep memory bounded: forget keys with no recent hits
            self.hits = defaultdict(list, {k: v for k, v in self.hits.items() if v})
        return self.hits[key]

    def check(self, key: str) -> None:
        if len(self._recent(key)) >= self.max_hits:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, self.message)

    def record(self, key: str) -> None:
        self._recent(key).append(time.time())

    def clear(self, key: str) -> None:
        self.hits.pop(key, None)


def reset_all() -> None:
    for limiter in _ALL:
        limiter.hits.clear()
