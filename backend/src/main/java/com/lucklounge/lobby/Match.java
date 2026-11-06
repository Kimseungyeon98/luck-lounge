package com.lucklounge.lobby;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * 하루 내기 한 번: 걸어서 투표 → (결과 발표) → 연속 판 → 요약.
 * <ul>
 *   <li>투표: 10초. 끝날 때 부스 위 인원이 많은 게임, 동률이면 무작위</li>
 *   <li>풍선 게임은 아직 없으므로(M5) 풍선이 이기면 안내 후 시한폭탄으로 진행</li>
 *   <li>부스 밖 사람은 투표만 기권하고 게임에는 참가 (자리비움·접속 끊김은 제외)</li>
 *   <li>당첨자 수만큼 판을 돌리고, 판마다 당첨자를 빼고 남은 사람끼리 다시</li>
 * </ul>
 * LobbyRoom 안에서만 쓰며 동기화는 LobbyRoom 이 맡는다.
 */
final class Match {

    static final Duration VOTE_TIME = Duration.ofSeconds(10);
    static final Duration ANNOUNCE_TIME = Duration.ofSeconds(3);
    static final Duration ANNOUNCE_TIME_BALLOON = Duration.ofSeconds(4);
    /** 폭발 후 다음 판까지 (결과 카드 + 3초 안내) */
    static final Duration BETWEEN_TIME = Duration.ofSeconds(4);
    static final Duration SUMMARY_TIME = Duration.ofSeconds(8);

    enum Phase { VOTING, ANNOUNCE, PLAYING, BETWEEN, SUMMARY }

    enum Booth { BOMB, BALLOON }

    record Winner(UUID playerId, int round, long heldMs) {
    }

    /** 내기 진행 중에 생긴 일. LobbyService 가 방송하고 기록한다. */
    sealed interface Event permits VoteStarted, VoteEnded, Cancelled, RoundStarted, BombEvent, RoundEnded, Summary, Finished {
    }

    record VoteStarted(long endsInMs, int winnersTarget, boolean practice) implements Event {
    }

    record VoteEnded(int bomb, int balloon, int abstain, Booth won, String gameType, List<UUID> participants,
                     int winnersTarget, boolean practice, Instant at) implements Event {
    }

    record Cancelled(String reason) implements Event {
    }

    record RoundStarted(int round, BombGame.Started start) implements Event {
    }

    /** 시한폭탄 한 판 안의 일 (보유자 변경, 폭발) */
    record BombEvent(BombGame.Event event) implements Event {
    }

    record RoundEnded(int round, UUID loser, long heldMs, List<UUID> players, int remaining, boolean more, Instant at) implements Event {
    }

    record Summary(List<Winner> winners, int participants, boolean practice) implements Event {
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
    private BombGame bomb;

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

    BombGame bomb() {
        return phase == Phase.PLAYING ? bomb : null;
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
                int bombVotes = 0;
                int balloonVotes = 0;
                for (UUID id : eligible) {
                    Booth b = boothOf.apply(id);
                    if (b == Booth.BOMB) {
                        bombVotes++;
                    } else if (b == Booth.BALLOON) {
                        balloonVotes++;
                    }
                }
                Booth won = bombVotes == balloonVotes
                        ? (random.nextBoolean() ? Booth.BOMB : Booth.BALLOON)
                        : (bombVotes > balloonVotes ? Booth.BOMB : Booth.BALLOON);
                remaining = List.copyOf(eligible);
                participantCount = remaining.size();
                winnersTarget = Math.max(1, Math.min(requestedWinners, participantCount - 1));
                events.add(new VoteEnded(bombVotes, balloonVotes, participantCount - bombVotes - balloonVotes, won,
                        "BOMB", remaining, winnersTarget, practice, now));
                phase = Phase.ANNOUNCE;
                phaseEndsAt = now.plus(won == Booth.BALLOON ? ANNOUNCE_TIME_BALLOON : ANNOUNCE_TIME);
            }
            case ANNOUNCE, BETWEEN -> {
                if (!now.isBefore(phaseEndsAt)) {
                    startRound(now, online, place, events);
                }
            }
            case PLAYING -> {
                for (BombGame.Event e : bomb.advanceTo(now, online)) {
                    if (e instanceof BombGame.Finished) {
                        continue;
                    }
                    events.add(new BombEvent(e));
                    if (e instanceof BombGame.Exploded x) {
                        Instant at = bomb.explodeAt();
                        List<UUID> players = bomb.order();
                        winners.add(new Winner(x.loser(), round, x.heldMs()));
                        remaining = remaining.stream().filter(id -> !id.equals(x.loser())).toList();
                        stepOut.accept(x.loser());
                        boolean more = winners.size() < winnersTarget
                                && remaining.stream().filter(online).count() >= 2;
                        events.add(new RoundEnded(round, x.loser(), x.heldMs(), players, remaining.size(), more, at));
                        if (more) {
                            phase = Phase.BETWEEN;
                            phaseEndsAt = at.plus(BETWEEN_TIME);
                        } else {
                            phase = Phase.SUMMARY;
                            phaseEndsAt = at.plus(Duration.ofMillis(1500)).plus(SUMMARY_TIME);
                            events.add(new Summary(List.copyOf(winners), participantCount, practice));
                        }
                        bomb = null;
                        break;
                    }
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
            events.add(new Summary(List.copyOf(winners), participantCount, practice));
            return;
        }
        round++;
        bomb = BombGame.start(remaining, now, random);
        place.accept(bomb.order());
        phase = Phase.PLAYING;
        events.add(new RoundStarted(round, new BombGame.Started(bomb.order(), bomb.holder(),
                LobbyRoom.BOMB_CENTER_X, LobbyRoom.BOMB_CENTER_Z)));
    }

    /** 진행 중인 판 (재접속한 사람에게 다시 알려 줄 때) */
    RoundStarted currentRound() {
        if (phase != Phase.PLAYING || bomb == null) {
            return null;
        }
        return new RoundStarted(round, new BombGame.Started(bomb.order(), bomb.holder(), LobbyRoom.BOMB_CENTER_X, LobbyRoom.BOMB_CENTER_Z));
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
