package com.lucklounge.lobby;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.Map;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * 하루 내기 한 번: 걸어서 투표 → (결과 발표) → 연속 판(복불복) 또는 한 판(경쟁) → 요약.
 * <ul>
 *   <li>투표: 10초. 끝날 때 부스 위 인원이 많은 게임, 동률이면 무작위</li>
 *   <li>부스 밖 사람은 투표만 기권하고 게임에는 참가 (자리비움·접속 끊김은 제외)</li>
 *   <li>당첨자 수만큼 판을 돌리고, 판마다 당첨자를 빼고 남은 사람끼리 다시</li>
 * </ul>
 * LobbyRoom 안에서만 쓰며 동기화는 LobbyRoom 이 맡는다.
 */
final class Match {

    static final Duration VOTE_TIME = Duration.ofSeconds(10);
    static final Duration ANNOUNCE_TIME = Duration.ofSeconds(3);
    /** 폭발 후 다음 판까지 (결과 카드 + 3초 안내) */
    static final Duration BETWEEN_TIME = Duration.ofSeconds(4);
    static final Duration SUMMARY_TIME = Duration.ofSeconds(8);
    /** 경쟁 게임 순위를 1등부터 한 명씩 발표하는 시간 (한 명당) */
    static final Duration REVEAL_EACH = Duration.ofMillis(600);

    enum Phase { VOTING, ANNOUNCE, PLAYING, BETWEEN, SUMMARY }

    /**
     * 게임 부스. 왼쪽이 복불복 존, 오른쪽이 경쟁 존. 프론트엔드 lounge.ts 의 BOOTHS 와 같은 자리여야 한다.
     * 이름이 곧 게임 종류(gameType)다.
     */
    enum Booth {
        BOMB(-3.4, 0.7, false), BALLOON(-3.4, 3.7, false), STOP(3.4, 0.7, true), TOWER(3.4, 3.7, true);

        static final double RADIUS = 1.45;

        final double x;
        final double z;
        final boolean skill;

        Booth(double x, double z, boolean skill) {
            this.x = x;
            this.z = z;
            this.skill = skill;
        }

        static Booth at(double x, double z) {
            for (Booth b : values()) {
                if (Math.hypot(x - b.x, z - b.z) < RADIUS) {
                    return b;
                }
            }
            return null;
        }
    }

    record Winner(UUID playerId, int round, long heldMs) {
    }

    /** 내기 진행 중에 생긴 일. LobbyService 가 방송하고 기록한다. */
    sealed interface Event permits VoteStarted, VoteEnded, Cancelled, RoundStarted, GameEvent, RoundEnded, Summary, Finished {
    }

    record VoteStarted(long endsInMs, int winnersTarget, boolean practice) implements Event {
    }

    record VoteEnded(Map<Booth, Integer> votes, int abstain, Booth won, String gameType, List<UUID> participants,
                     int winnersTarget, boolean practice, Instant at) implements Event {

        int votes(Booth b) {
            return votes.getOrDefault(b, 0);
        }
    }

    record Cancelled(String reason) implements Event {
    }

    record RoundStarted(int round, String gameType, PartyGame.GameEvent start) implements Event {
    }

    /** 한 판 안의 일 (시한폭탄: 보유자 변경·폭발, 풍선: 차례·펌프질·터짐) */
    record GameEvent(PartyGame.GameEvent event) implements Event {
    }

    record RoundEnded(int round, String gameType, PartyGame.Outcome outcome, List<UUID> players, int remaining, boolean more) implements Event {
    }

    record Summary(String gameType, List<Winner> winners, int participants, boolean practice) implements Event {
    }

    record Finished(Instant at) implements Event {
    }

    private final int requestedWinners;
    private final boolean practice;
    private final Random random;
    private Phase phase = Phase.VOTING;
    private Instant phaseEndsAt;
    private List<UUID> remaining = List.of();
    private int participantCount;
    private int winnersTarget;
    private final List<Winner> winners = new ArrayList<>();
    private int round;
    private PartyGame game;
    private String gameType = "BOMB";

    Match(int winnersTarget, boolean practice, Instant now, Random random) {
        this.requestedWinners = winnersTarget;
        this.practice = practice;
        this.random = random;
        this.phaseEndsAt = now.plus(VOTE_TIME);
    }

    VoteStarted started() {
        return new VoteStarted(VOTE_TIME.toMillis(), requestedWinners, practice);
    }

    Phase phase() {
        return phase;
    }

    /** 투표 중에는 걸을 수 있고, 그 뒤로는 참가자는 제자리 */
    boolean locks(UUID playerId) {
        return phase != Phase.VOTING && remaining.contains(playerId);
    }

    /** 진행 중인 판 */
    PartyGame game() {
        return phase == Phase.PLAYING ? game : null;
    }

    /**
     * 시간을 now 까지 진행한다.
     *
     * @param boothOf  지금 그 사람이 서 있는 부스 (없으면 null)
     * @param eligible 게임에 참가할 수 있는 사람 (접속 중이고 자리비움 아님), 먼저 온 순서
     * @param online   접속 중인지
     * @param place    참가자를 둥글게 세우는 함수
     */
    List<Event> advanceTo(Instant now, Function<UUID, Booth> boothOf, List<UUID> eligible, Predicate<UUID> online,
                          java.util.function.Consumer<List<UUID>> place, java.util.function.Consumer<UUID> stepOut) {
        List<Event> events = new ArrayList<>();
        switch (phase) {
            case VOTING -> {
                if (now.isBefore(phaseEndsAt)) {
                    break;
                }
                if (eligible.size() < 2) {
                    events.add(new Cancelled("2명 이상 모여야 시작할 수 있어요."));
                    events.add(new Finished(now));
                    return events;
                }
                Map<Booth, Integer> votes = new EnumMap<>(Booth.class);
                for (Booth b : Booth.values()) {
                    votes.put(b, 0);
                }
                int voted = 0;
                for (UUID id : eligible) {
                    Booth b = boothOf.apply(id);
                    if (b != null) {
                        votes.merge(b, 1, Integer::sum);
                        voted++;
                    }
                }
                // 가장 많은 부스. 동률이면 그 부스들 중 무작위 (아무도 안 섰으면 네 부스 중 무작위)
                int top = votes.values().stream().max(Integer::compare).orElse(0);
                List<Booth> tied = votes.entrySet().stream().filter(e -> e.getValue() == top).map(Map.Entry::getKey).toList();
                Booth won = tied.get(random.nextInt(tied.size()));
                remaining = List.copyOf(eligible);
                participantCount = remaining.size();
                winnersTarget = Math.max(1, Math.min(requestedWinners, participantCount - 1));
                gameType = won.name();
                events.add(new VoteEnded(votes, participantCount - voted, won,
                        gameType, remaining, winnersTarget, practice, now));
                phase = Phase.ANNOUNCE;
                phaseEndsAt = now.plus(ANNOUNCE_TIME);
            }
            case ANNOUNCE, BETWEEN -> {
                if (!now.isBefore(phaseEndsAt)) {
                    startRound(now, online, place, events);
                }
            }
            case PLAYING -> {
                for (PartyGame.GameEvent e : game.advanceTo(now, online)) {
                    if (e instanceof BombGame.Finished) {
                        continue;
                    }
                    events.add(new GameEvent(e));
                }
                PartyGame.Outcome outcome = game.outcome();
                if (outcome != null && game instanceof SkillGame skill) {
                    // 경쟁 게임은 한 번에 끝: 아래에서부터 당첨자 수만큼
                    List<UUID> players = game.order();
                    List<UUID> worst = skill.worstFirst();
                    for (int i = 0; i < winnersTarget && i < worst.size(); i++) {
                        UUID loser = worst.get(i);
                        winners.add(new Winner(loser, i + 1, 0));
                        events.add(new RoundEnded(i + 1, gameType, new PartyGame.Outcome(loser, 0, null, null, outcome.at()),
                                players, players.size(), false));
                    }
                    phase = Phase.SUMMARY;
                    phaseEndsAt = outcome.at().plus(REVEAL_EACH.multipliedBy(players.size())).plus(Duration.ofMillis(2500))
                            .plus(SUMMARY_TIME);
                    events.add(new Summary(gameType, List.copyOf(winners), participantCount, practice));
                    game = null;
                } else if (outcome != null) {
                    List<UUID> players = game.order();
                    winners.add(new Winner(outcome.loser(), round, outcome.heldMs()));
                    remaining = remaining.stream().filter(id -> !id.equals(outcome.loser())).toList();
                    stepOut.accept(outcome.loser());
                    boolean more = winners.size() < winnersTarget
                            && remaining.stream().filter(online).count() >= 2;
                    events.add(new RoundEnded(round, gameType, outcome, players, remaining.size(), more));
                    if (more) {
                        phase = Phase.BETWEEN;
                        phaseEndsAt = outcome.at().plus(BETWEEN_TIME);
                    } else {
                        phase = Phase.SUMMARY;
                        phaseEndsAt = outcome.at().plus(Duration.ofMillis(1500)).plus(SUMMARY_TIME);
                        events.add(new Summary(gameType, List.copyOf(winners), participantCount, practice));
                    }
                    game = null;
                }
            }
            case SUMMARY -> {
                if (!now.isBefore(phaseEndsAt)) {
                    events.add(new Finished(now));
                }
            }
        }
        return events;
    }

    private void startRound(Instant now, Predicate<UUID> online, java.util.function.Consumer<List<UUID>> place, List<Event> events) {
        // 그 사이 나간 사람은 다음 판에서 빠진다
        remaining = remaining.stream().filter(online).toList();
        if (remaining.size() < 2) {
            phase = Phase.SUMMARY;
            phaseEndsAt = now.plus(SUMMARY_TIME);
            events.add(new Summary(gameType, List.copyOf(winners), participantCount, practice));
            return;
        }
        round++;
        game = switch (gameType) {
            case "BALLOON" -> BalloonGame.start(remaining, now, random);
            case "STOP", "TOWER" -> SkillGame.start(gameType, remaining, now, random);
            default -> BombGame.start(remaining, now, random);
        };
        place.accept(game.order());
        phase = Phase.PLAYING;
        events.add(new RoundStarted(round, gameType, game.startedEvent(LobbyRoom.BOMB_CENTER_X, LobbyRoom.BOMB_CENTER_Z)));
    }

    /** 진행 중인 판 (재접속한 사람에게 다시 알려 줄 때) */
    RoundStarted currentRound() {
        if (phase != Phase.PLAYING || game == null) {
            return null;
        }
        return new RoundStarted(round, gameType, game.startedEvent(LobbyRoom.BOMB_CENTER_X, LobbyRoom.BOMB_CENTER_Z));
    }

    Instant phaseEndsAt() {
        return phaseEndsAt;
    }

    int winnersTarget() {
        return winnersTarget == 0 ? requestedWinners : winnersTarget;
    }

    boolean practice() {
        return practice;
    }
}
