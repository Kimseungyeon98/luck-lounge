package com.lucklounge.lobby;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * 경쟁 존 게임 (10초 멈추기, 탑 쌓기, 과녁 멈추기). 모두 동시에 각자 휴대폰에서 한 판만 하고, 점수 순위로 당첨자를 정한다.
 * <ul>
 *   <li>3초 카운트다운 뒤 플레이 시간이 열린다. 점수는 휴대폰이 재서 보낸다 (인터넷 속도와 무관)</li>
 *   <li>접속 중인 참가자가 모두 내거나 시간이 다 되면 끝. 못 낸 사람은 맨 아래</li>
 *   <li>같은 점수면 탑 쌓기는 마지막 블록 폭이 넓은 쪽, 그래도 같으면 무작위</li>
 * </ul>
 */
final class SkillGame implements PartyGame {

    static final Duration COUNTDOWN = Duration.ofSeconds(3);
    /** 끝난 휴대폰이 점수를 보내는 데 걸리는 여유 */
    static final Duration GRACE = Duration.ofSeconds(2);

    /** 게임 종류: 플레이 시간, 작을수록 좋은지, 점수 범위 */
    enum Kind {
        /** 점수 = 10초와의 차이(ms) */
        STOP(Duration.ofSeconds(25), true, 60_000),
        /** 점수 = 쌓은 층 수, extra = 마지막 블록 폭(0~1) */
        TOWER(Duration.ofSeconds(60), false, 500),
        /** 점수 = 바늘과 가운데의 평균 거리(%, 3번) */
        TARGET(Duration.ofSeconds(25), true, 100);

        final Duration playTime;
        final boolean lowerBetter;
        final double maxScore;

        Kind(Duration playTime, boolean lowerBetter, double maxScore) {
            this.playTime = playTime;
            this.lowerBetter = lowerBetter;
            this.maxScore = maxScore;
        }

        static Kind of(String type) {
            return valueOf(type);
        }

        /** 휴대폰이 보낸 값이 말이 되는지 */
        boolean valid(double score, Double extra) {
            if (!Double.isFinite(score) || score < 0 || score > maxScore) {
                return false;
            }
            if (this == TOWER) {
                return score == Math.floor(score) && (extra == null || (Double.isFinite(extra) && extra >= 0 && extra <= 1));
            }
            return extra == null;
        }

        /** 더 좋은 기록이 앞에 오는 비교 */
        Comparator<Entry> better() {
            Comparator<Entry> byScore = Comparator.comparingDouble(e -> e.score());
            if (!lowerBetter) {
                byScore = byScore.reversed();
            }
            if (this == TOWER) {
                byScore = byScore.thenComparing(Comparator.comparingDouble((Entry e) -> e.extra() == null ? 0 : e.extra()).reversed());
            }
            return byScore;
        }
    }

    sealed interface Event extends GameEvent permits Started, Progress, Result {
    }

    /** startedAt: 판이 열린 때. 카운트다운이 끝나면 플레이, playEndsAt 까지 */
    record Started(String gameType, Instant startedAt, long countdownMs, long playMs, List<UUID> players,
                   boolean lowerBetter) implements Event {
    }

    record Progress(int done, int total) implements Event {
    }

    /** score 가 null 이면 시간 안에 못 냄 */
    record Entry(UUID player, Double score, Double extra) {
    }

    /** 순위: 잘한 사람부터 */
    record Result(String gameType, boolean lowerBetter, List<Entry> ranking, Instant at) implements Event {
    }

    enum SubmitResult { OK, NOT_PLAYER, ALREADY, TOO_EARLY, LATE, INVALID }

    private final Kind kind;
    private final List<UUID> players;
    private final Instant startedAt;
    private final Instant endsAt;
    private final Map<UUID, Entry> scores = new LinkedHashMap<>();
    /** 같은 점수일 때 쓸 무작위 순서 (판이 열릴 때 정해 둠) */
    private final Map<UUID, Integer> tieBreak = new HashMap<>();
    private boolean progressChanged;
    private Result result;

    private SkillGame(Kind kind, List<UUID> players, Instant now, Random random) {
        this.kind = kind;
        this.players = List.copyOf(players);
        this.startedAt = now;
        this.endsAt = now.plus(COUNTDOWN).plus(kind.playTime).plus(GRACE);
        for (UUID p : players) {
            tieBreak.put(p, random.nextInt());
        }
    }

    static SkillGame start(String type, List<UUID> players, Instant now, Random random) {
        return new SkillGame(Kind.of(type), players, now, random);
    }

    static boolean isSkill(String type) {
        return "STOP".equals(type) || "TOWER".equals(type) || "TARGET".equals(type);
    }

    @Override
    public String type() {
        return kind.name();
    }

    @Override
    public List<UUID> order() {
        return players;
    }

    @Override
    public GameEvent startedEvent(double centerX, double centerZ) {
        return new Started(kind.name(), startedAt, COUNTDOWN.toMillis(), kind.playTime.toMillis(), players, kind.lowerBetter);
    }

    synchronized SubmitResult submit(UUID player, double score, Double extra, Instant now) {
        if (!players.contains(player)) {
            return SubmitResult.NOT_PLAYER;
        }
        if (result != null || now.isAfter(endsAt)) {
            return SubmitResult.LATE;
        }
        if (scores.containsKey(player)) {
            return SubmitResult.ALREADY;
        }
        if (now.isBefore(startedAt.plus(COUNTDOWN))) {
            return SubmitResult.TOO_EARLY;
        }
        if (!kind.valid(score, extra)) {
            return SubmitResult.INVALID;
        }
        scores.put(player, new Entry(player, score, extra));
        progressChanged = true;
        return SubmitResult.OK;
    }

    @Override
    public List<? extends GameEvent> advanceTo(Instant now, Predicate<UUID> online) {
        if (result != null) {
            return List.of();
        }
        List<Event> events = new ArrayList<>();
        if (progressChanged) {
            progressChanged = false;
            events.add(new Progress(scores.size(), players.size()));
        }
        boolean everyoneDone = players.stream().allMatch(p -> scores.containsKey(p) || !online.test(p));
        if (everyoneDone || !now.isBefore(endsAt)) {
            result = new Result(kind.name(), kind.lowerBetter, ranking(), now);
            events.add(result);
        }
        return events;
    }

    private List<Entry> ranking() {
        Comparator<Entry> tie = Comparator.comparingInt(e -> tieBreak.get(e.player()));
        List<Entry> done = new ArrayList<>(scores.values());
        done.sort(kind.better().thenComparing(tie));
        List<Entry> missing = new ArrayList<>(players.stream().filter(p -> !scores.containsKey(p))
                .map(p -> new Entry(p, null, null)).toList());
        missing.sort(tie);
        done.addAll(missing);
        return List.copyOf(done);
    }

    Result result() {
        return result;
    }

    /** 못한 사람부터 */
    List<UUID> worstFirst() {
        List<UUID> out = new ArrayList<>(result.ranking().stream().map(Entry::player).toList());
        java.util.Collections.reverse(out);
        return out;
    }

    @Override
    public Outcome outcome() {
        if (result == null) {
            return null;
        }
        return new Outcome(worstFirst().getFirst(), 0, null, null, result.at());
    }
}
