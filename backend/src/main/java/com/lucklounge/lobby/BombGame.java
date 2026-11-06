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
 * 시한폭탄 돌리기 한 판. 모든 판정은 서버 시각 기준이다.
 * <ul>
 *   <li>순서는 무작위, 폭탄은 순서대로 다음 사람에게 넘어간다</li>
 *   <li>받고 {@link #MIN_HOLD} 전에는 넘길 수 없고, {@link #MAX_HOLD} 가 지나면 자동으로 넘어간다</li>
 *   <li>연결이 끊긴 사람이 들고 있으면 바로 넘어간다</li>
 *   <li>숨은 시간({@link #FUSE_MIN}~{@link #FUSE_MAX})이 끝나는 순간 들고 있는 사람이 당첨</li>
 * </ul>
 * LobbyRoom 안에서만 쓰며 동기화는 LobbyRoom 이 맡는다.
 */
final class BombGame implements PartyGame {

    static final Duration MIN_HOLD = Duration.ofSeconds(1);
    static final Duration MAX_HOLD = Duration.ofSeconds(5);
    static final Duration FUSE_MIN = Duration.ofSeconds(15);
    static final Duration FUSE_MAX = Duration.ofSeconds(40);
    /** 결과를 보여 준 뒤 대기실로 돌아가기까지 */
    static final Duration RESULT_TIME = Duration.ofSeconds(6);

    enum PassResult { PASSED, TOO_EARLY, NOT_HOLDER, OVER }

    /** 게임 중 생긴 일. LobbyService 가 그대로 방송한다. */
    sealed interface Event extends PartyGame.GameEvent permits Started, HolderChanged, Exploded, Finished {
    }

    record Started(List<UUID> order, UUID holder, double centerX, double centerZ) implements Event {
    }

    record HolderChanged(UUID holder, boolean auto) implements Event {
    }

    record Exploded(UUID loser, long heldMs) implements Event {
    }

    record Finished() implements Event {
    }

    private final List<UUID> order;
    private final Instant explodeAt;
    private int holderIdx;
    private Instant receivedAt;
    private UUID loser;
    private long lastHeldMs;
    private Instant endedAt;

    private BombGame(List<UUID> order, int firstHolder, Instant now, Duration fuse) {
        this.order = List.copyOf(order);
        this.holderIdx = firstHolder;
        this.receivedAt = now;
        this.explodeAt = now.plus(fuse);
    }

    static BombGame start(List<UUID> players, Instant now, Random random) {
        List<UUID> order = new ArrayList<>(players);
        Collections.shuffle(order, random);
        long fuseMs = FUSE_MIN.toMillis() + (long) (random.nextDouble() * (FUSE_MAX.toMillis() - FUSE_MIN.toMillis()));
        return new BombGame(order, random.nextInt(order.size()), now, Duration.ofMillis(fuseMs));
    }

    /** 테스트용: 순서·첫 보유자·숨은 시간을 직접 정한다 */
    static BombGame fixed(List<UUID> order, int firstHolder, Instant now, Duration fuse) {
        return new BombGame(order, firstHolder, now, fuse);
    }

    public List<UUID> order() {
        return order;
    }

    UUID holder() {
        return order.get(holderIdx);
    }

    boolean exploded() {
        return loser != null;
    }

    boolean participates(UUID id) {
        return order.contains(id);
    }

    @Override
    public String type() {
        return "BOMB";
    }

    @Override
    public GameEvent startedEvent(double centerX, double centerZ) {
        return new Started(order, holder(), centerX, centerZ);
    }

    @Override
    public Outcome outcome() {
        if (!exploded()) {
            return null;
        }
        return new Outcome(loser, lastHeldMs, null, null, explodeAt);
    }

    Instant explodeAt() {
        return explodeAt;
    }

    PassResult pass(UUID playerId, Instant now) {
        if (exploded() || !now.isBefore(explodeAt)) {
            return PassResult.OVER;
        }
        if (!holder().equals(playerId)) {
            return PassResult.NOT_HOLDER;
        }
        if (Duration.between(receivedAt, now).compareTo(MIN_HOLD) < 0) {
            return PassResult.TOO_EARLY;
        }
        advance(now);
        return PassResult.PASSED;
    }

    /**
     * 시간을 now 까지 진행한다. 0.1초 틱이 조금 늦게 와도, 자동 넘김과 폭발을
     * 실제로 일어났어야 할 시각 순서대로 처리하므로 결과가 틱 간격에 좌우되지 않는다.
     */
    public List<Event> advanceTo(Instant now, Predicate<UUID> online) {
        List<Event> events = new ArrayList<>();
        if (exploded()) {
            if (Duration.between(endedAt, now).compareTo(RESULT_TIME) >= 0) {
                events.add(new Finished());
            }
            return events;
        }
        while (true) {
            // 연결이 끊긴 사람이 들고 있으면 바로 다음 사람에게 (남은 사람이 있을 때)
            if (!online.test(holder()) && now.isBefore(explodeAt) && order.stream().anyMatch(online)) {
                advance(now);
                events.add(new HolderChanged(holder(), true));
                continue;
            }
            Instant autoPassAt = receivedAt.plus(MAX_HOLD);
            if (autoPassAt.isBefore(explodeAt) && !autoPassAt.isAfter(now)) {
                advance(autoPassAt);
                events.add(new HolderChanged(holder(), true));
                continue;
            }
            if (!explodeAt.isAfter(now)) {
                loser = holder();
                endedAt = explodeAt;
                lastHeldMs = Duration.between(receivedAt, explodeAt).toMillis();
                events.add(new Exploded(loser, lastHeldMs));
            }
            break;
        }
        return events;
    }

    private void advance(Instant at) {
        holderIdx = (holderIdx + 1) % order.size();
        receivedAt = at;
    }
}
