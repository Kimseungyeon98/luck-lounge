package com.lucklounge.team;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 메모리 안에서 세는 간단한 횟수 제한 (서버가 재시작하면 처음부터). 열쇠(IP 등)별로 기간 안의 횟수를 센다.
 */
final class RateLimiter {

    private final int limit;
    private final long windowMs;
    private final Clock clock;
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    RateLimiter(int limit, Duration window, Clock clock) {
        this.limit = limit;
        this.windowMs = window.toMillis();
        this.clock = clock;
    }

    /** 이미 한도에 찼는지 (세지는 않는다) */
    boolean blocked(String key) {
        long now = clock.millis();
        Deque<Long> q = hits.get(key);
        if (q == null) {
            return false;
        }
        synchronized (q) {
            prune(q, now);
            return q.size() >= limit;
        }
    }

    void record(String key) {
        long now = clock.millis();
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q, now);
            q.addLast(now);
        }
        if (hits.size() > 10_000) {
            // 오래 안 온 열쇠 정리 (메모리 보호)
            hits.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    prune(e.getValue(), now);
                    return e.getValue().isEmpty();
                }
            });
        }
    }

    private void prune(Deque<Long> q, long now) {
        while (!q.isEmpty() && now - q.peekFirst() >= windowMs) {
            q.pollFirst();
        }
    }
}
