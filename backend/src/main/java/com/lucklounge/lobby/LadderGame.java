package com.lucklounge.lobby;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * 사다리 타기 (복불복). 참가자 수만큼 세로줄, 아래 칸 하나에 ☕.
 * <ul>
 *   <li>10초 안에 각자 위쪽 줄을 하나씩 고른다. 못 고른 사람은 남은 줄 중 무작위</li>
 *   <li>모두 고르면 사다리(가로줄)와 ☕ 칸을 공개한다. 둘 다 서버만 알고 있다가 이때 처음 보낸다</li>
 *   <li>따라 내려가 ☕ 칸에 닿은 사람이 당첨. 화면이 사다리를 따라 내려가는 시간만큼 기다렸다가 판을 끝낸다</li>
 * </ul>
 */
final class LadderGame implements PartyGame {

    static final Duration PICK_TIME = Duration.ofSeconds(10);
    /** 공개 후 화면에서 사다리를 따라 내려가는 시간 */
    static final Duration REVEAL_TIME = Duration.ofMillis(4500);
    static final int ROWS = 9;

    sealed interface Event extends GameEvent permits Started, Picked, Revealed {
    }

    /** picks: 줄 번호 → 고른 사람 (재접속한 사람에게 다시 보낼 때) */
    record Started(List<UUID> players, int columns, long pickMs, Map<Integer, UUID> picks, double centerX, double centerZ)
            implements Event {
    }

    record Picked(UUID player, int column, boolean auto) implements Event {
    }

    /** rungs: {줄 r, 왼쪽 세로줄 k} — r 번째 높이에서 k 와 k+1 을 잇는 가로줄 */
    record Revealed(List<int[]> rungs, Map<Integer, UUID> picks, int coffeeColumn, UUID loser, int loserStart) implements Event {
    }

    enum PickResult { PICKED, TAKEN, ALREADY, NOT_PLAYER, INVALID, OVER }

    private final List<UUID> players;
    private final Random random;
    private final Instant pickEndsAt;
    private final Map<Integer, UUID> picks = new LinkedHashMap<>();
    private final Map<UUID, Integer> byPlayer = new HashMap<>();
    private final List<Event> pending = new ArrayList<>();
    private final List<int[]> rungs;
    private final int coffee;
    private Instant revealedAt;
    private UUID loser;

    private LadderGame(List<UUID> players, Instant now, Random random, List<int[]> rungs, int coffee) {
        this.players = List.copyOf(players);
        this.random = random;
        this.pickEndsAt = now.plus(PICK_TIME);
        this.rungs = rungs;
        this.coffee = coffee;
    }

    static LadderGame start(List<UUID> players, Instant now, Random random) {
        int n = players.size();
        List<int[]> rungs = new ArrayList<>();
        for (int r = 0; r < ROWS; r++) {
            boolean prev = false;
            for (int k = 0; k < n - 1; k++) {
                // 같은 높이에서 이웃한 가로줄은 겹치지 않게
                if (!prev && random.nextDouble() < 0.45) {
                    rungs.add(new int[]{r, k});
                    prev = true;
                } else {
                    prev = false;
                }
            }
        }
        return new LadderGame(players, now, random, rungs, random.nextInt(n));
    }

    /** 테스트용: 사다리와 ☕ 칸을 정해서 시작 */
    static LadderGame fixed(List<UUID> players, Instant now, List<int[]> rungs, int coffee) {
        return new LadderGame(players, now, new Random(0), rungs, coffee);
    }

    @Override
    public String type() {
        return "LADDER";
    }

    @Override
    public List<UUID> order() {
        return players;
    }

    @Override
    public GameEvent startedEvent(double centerX, double centerZ) {
        return new Started(players, players.size(), PICK_TIME.toMillis(), Map.copyOf(picks), centerX, centerZ);
    }

    PickResult pick(UUID player, int column, Instant now) {
        if (revealedAt != null || !now.isBefore(pickEndsAt)) {
            return PickResult.OVER;
        }
        if (!players.contains(player)) {
            return PickResult.NOT_PLAYER;
        }
        if (column < 0 || column >= players.size()) {
            return PickResult.INVALID;
        }
        if (byPlayer.containsKey(player)) {
            return PickResult.ALREADY;
        }
        if (picks.containsKey(column)) {
            return PickResult.TAKEN;
        }
        picks.put(column, player);
        byPlayer.put(player, column);
        pending.add(new Picked(player, column, false));
        return PickResult.PICKED;
    }

    @Override
    public List<? extends GameEvent> advanceTo(Instant now, Predicate<UUID> online) {
        lastNow = now;
        List<Event> out = new ArrayList<>(pending);
        pending.clear();
        if (revealedAt == null) {
            boolean everyone = players.stream().allMatch(p -> byPlayer.containsKey(p) || !online.test(p));
            if (everyone || !now.isBefore(pickEndsAt)) {
                // 못 고른 사람(나간 사람 포함)은 남은 줄 중 무작위
                List<Integer> free = new ArrayList<>();
                for (int c = 0; c < players.size(); c++) {
                    if (!picks.containsKey(c)) {
                        free.add(c);
                    }
                }
                java.util.Collections.shuffle(free, random);
                for (UUID p : players) {
                    if (!byPlayer.containsKey(p)) {
                        int c = free.removeFirst();
                        picks.put(c, p);
                        byPlayer.put(p, c);
                        out.add(new Picked(p, c, true));
                    }
                }
                int start = startOf(coffee);
                loser = picks.get(start);
                revealedAt = now;
                out.add(new Revealed(List.copyOf(rungs), Map.copyOf(picks), coffee, loser, start));
            }
        }
        return out;
    }

    /** ☕ 칸에 닿는 출발 줄: 아래에서 위로 거꾸로 따라 올라간다 */
    private int startOf(int bottom) {
        int c = bottom;
        for (int r = ROWS - 1; r >= 0; r--) {
            c = step(r, c);
        }
        return c;
    }

    /** 위에서 내려올 때 r 번째 높이에서 옮겨 가는 줄 */
    int endOf(int start) {
        int c = start;
        for (int r = 0; r < ROWS; r++) {
            c = step(r, c);
        }
        return c;
    }

    private int step(int r, int c) {
        for (int[] g : rungs) {
            if (g[0] == r && g[1] == c) {
                return c + 1;
            }
            if (g[0] == r && g[1] == c - 1) {
                return c - 1;
            }
        }
        return c;
    }

    @Override
    public Outcome outcome() {
        if (revealedAt == null) {
            return null;
        }
        Instant done = revealedAt.plus(REVEAL_TIME);
        // 화면이 다 내려갈 때까지 판을 끝내지 않는다 (Match 는 advanceTo 바로 다음에 outcome 을 본다)
        return lastNow != null && !lastNow.isBefore(done) ? new Outcome(loser, 0, null, null, done) : null;
    }

    /** 마지막으로 진행한 시각 (공개 후 기다리는 시간을 재기 위해) */
    private Instant lastNow;
}
