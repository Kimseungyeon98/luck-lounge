package com.lucklounge.lobby;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * 풍선 불기 한 판. 모든 판정은 서버 기준이다.
 * <ul>
 *   <li>순서는 무작위. 내 차례에 1~3번 펌프질</li>
 *   <li>{@link #TURN_TIME} 안에 고르지 않으면 1번 자동, 차례인 사람이 나가면 바로 1번 자동</li>
 *   <li>숨은 한계({@link #LIMIT_MIN}~{@link #LIMIT_MAX})를 넘기는 펌프질을 한 사람이 당첨. 한계는 끝난 뒤에만 공개</li>
 * </ul>
 */
final class BalloonGame implements PartyGame {

    static final Duration TURN_TIME = Duration.ofSeconds(7);
    static final int LIMIT_MIN = 12;
    static final int LIMIT_MAX = 30;

    enum PumpResult { PUMPED, NOT_YOUR_TURN, INVALID, OVER }

    sealed interface Event extends PartyGame.GameEvent permits Started, Turn, Pumped, Popped {
    }

    record Started(List<UUID> order, UUID turn, int count, int limitMin, int limitMax, double centerX, double centerZ) implements Event {
    }

    record Turn(UUID player) implements Event {
    }

    record Pumped(UUID player, int pumps, int count, boolean auto) implements Event {
    }

    record Popped(UUID loser, int count, int limit) implements Event {
    }

    private final List<UUID> order;
    private final int limit;
    private int turnIdx;
    private Instant turnStartedAt;
    private int count;
    private UUID loser;
    private Instant poppedAt;
    /** pump() 로 생긴 일. 다음 advanceTo 에서 함께 내보낸다 (한 판의 소식은 한 길로만 나가게) */
    private final List<Event> pending = new ArrayList<>();

    private BalloonGame(List<UUID> order, int first, int limit, Instant now) {
        this.order = List.copyOf(order);
        this.turnIdx = first;
        this.limit = limit;
        this.turnStartedAt = now;
    }

    static BalloonGame start(List<UUID> players, Instant now, Random random) {
        List<UUID> order = new ArrayList<>(players);
        Collections.shuffle(order, random);
        int limit = LIMIT_MIN + random.nextInt(LIMIT_MAX - LIMIT_MIN + 1);
        return new BalloonGame(order, random.nextInt(order.size()), limit, now);
    }

    /** 테스트용 */
    static BalloonGame fixed(List<UUID> order, int first, int limit, Instant now) {
        return new BalloonGame(order, first, limit, now);
    }

    @Override
    public String type() {
        return "BALLOON";
    }

    @Override
    public List<UUID> order() {
        return order;
    }

    UUID turn() {
        return order.get(turnIdx);
    }

    int count() {
        return count;
    }

    @Override
    public GameEvent startedEvent(double centerX, double centerZ) {
        return new Started(order, turn(), count, LIMIT_MIN, LIMIT_MAX, centerX, centerZ);
    }

    PumpResult pump(UUID playerId, int pumps, Instant now) {
        if (loser != null) {
            return PumpResult.OVER;
        }
        if (!turn().equals(playerId)) {
            return PumpResult.NOT_YOUR_TURN;
        }
        if (pumps < 1 || pumps > 3) {
            return PumpResult.INVALID;
        }
        apply(pumps, false, now);
        return PumpResult.PUMPED;
    }

    private void apply(int pumps, boolean auto, Instant at) {
        UUID player = turn();
        int before = count;
        count = Math.min(before + pumps, limit + 1);
        pending.add(new Pumped(player, count - before, count, auto));
        if (count > limit) {
            loser = player;
            poppedAt = at;
            pending.add(new Popped(player, count, limit));
            return;
        }
        turnIdx = (turnIdx + 1) % order.size();
        turnStartedAt = at;
        pending.add(new Turn(turn()));
    }

    @Override
    public List<Event> advanceTo(Instant now, Predicate<UUID> online) {
        while (loser == null) {
            if (!online.test(turn()) && order.stream().anyMatch(online)) {
                apply(1, true, now);
                continue;
            }
            Instant autoAt = turnStartedAt.plus(TURN_TIME);
            if (!autoAt.isAfter(now)) {
                apply(1, true, autoAt);
                continue;
            }
            break;
        }
        List<Event> out = List.copyOf(pending);
        pending.clear();
        return out;
    }

    @Override
    public Outcome outcome() {
        return loser == null ? null : new Outcome(loser, 0, count, limit, poppedAt);
    }
}
