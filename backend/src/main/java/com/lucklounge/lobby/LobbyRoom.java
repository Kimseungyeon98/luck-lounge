package com.lucklounge.lobby;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.security.SecureRandom;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * 한 팀의 대기실 상태. 서버가 위치를 계산하는 기준 데이터다.
 * 모든 메서드는 synchronized 라서 한 팀의 요청은 한 줄로 처리된다 (넘기기·이동·틱이 섞이지 않음).
 */
public class LobbyRoom {

    public static final double SPEED = 2.4;
    static final Duration HOST_GRACE = Duration.ofSeconds(10);
    static final Duration CHAT_INTERVAL = Duration.ofMillis(1000);
    static final double SPAWN_X = 0.0;
    static final double SPAWN_Z = 4.4;

    /** 대기실의 한 사람 */
    static final class Member {
        final UUID id;
        String nickname;
        int characterIndex;
        double x;
        double z;
        double face = 0.67;
        Double targetX;
        Double targetZ;
        double dirX;
        double dirZ;
        boolean moving;
        boolean away;
        long arrivalOrder;
        Instant lastChatAt = Instant.EPOCH;
        final Set<String> sessions = new HashSet<>();

        Member(UUID id) {
            this.id = id;
        }

        boolean online() {
            return !sessions.isEmpty();
        }
    }

    public record PositionView(UUID id, double x, double z, double f, boolean m) {
    }

    public record MemberView(UUID playerId, String nickname, int characterIndex, boolean away) {
    }

    public record PresenceView(List<MemberView> players, UUID hostId) {
    }

    /** 틱 한 번의 결과: 위치가 바뀌었는지, 접속자·방장 정보가 바뀌었는지, 시한폭탄에 일어난 일 */
    public record TickResult(boolean positionsChanged, boolean presenceChanged, List<Match.Event> matchEvents) {
    }

    public enum StartFailure { NOT_HOST, ALREADY_RUNNING, NOT_ENOUGH_PLAYERS }

    /** 시한폭탄 판이 둥글게 서는 자리의 중심 (테이블·부스와 겹치지 않는 곳) */
    static final double BOMB_CENTER_X = 0.0;
    static final double BOMB_CENTER_Z = 1.4;

    private final String teamSlug;
    private final Map<UUID, Member> members = new LinkedHashMap<>();
    private final Map<String, UUID> sessionOwner = new HashMap<>();
    private long arrivalCounter;
    private UUID hostId;
    private Instant hostAbsentSince;
    private final Random random;
    private Match match;

    public LobbyRoom(String teamSlug) {
        this(teamSlug, new SecureRandom());
    }

    LobbyRoom(String teamSlug, Random random) {
        this.teamSlug = teamSlug;
        this.random = random;
    }

    public String teamSlug() {
        return teamSlug;
    }

    /** 휴대폰 하나가 접속. 처음 오는 사람이면 입구에서 시작하고, 방장이 없으면 방장이 된다. */
    public synchronized void join(String sessionId, UUID playerId, String nickname, int characterIndex) {
        Member m = members.computeIfAbsent(playerId, id -> {
            Member n = new Member(id);
            n.arrivalOrder = ++arrivalCounter;
            double spread = ((arrivalCounter % 5) - 2) * 0.6;
            n.x = SPAWN_X + spread;
            n.z = SPAWN_Z;
            return n;
        });
        m.nickname = nickname;
        m.characterIndex = characterIndex;
        m.sessions.add(sessionId);
        m.away = false;
        sessionOwner.put(sessionId, playerId);
        if (hostId == null) {
            hostId = playerId;
        }
        if (playerId.equals(hostId)) {
            hostAbsentSince = null;
        }
    }

    /** 휴대폰 하나가 끊김. @return 그 사람이 완전히 나갔으면 true */
    public synchronized boolean leave(String sessionId, Instant now) {
        UUID id = sessionOwner.remove(sessionId);
        if (id == null) {
            return false;
        }
        Member m = members.get(id);
        m.sessions.remove(sessionId);
        if (m.online()) {
            return false;
        }
        m.targetX = null;
        m.targetZ = null;
        m.dirX = 0;
        m.dirZ = 0;
        m.moving = false;
        if (id.equals(hostId)) {
            hostAbsentSince = now;
        }
        return true;
    }

    public synchronized boolean contains(String sessionId) {
        return sessionOwner.containsKey(sessionId);
    }

    /** 탭 이동: 목적지 */
    public synchronized void moveTo(UUID playerId, double tx, double tz) {
        Member m = onlineMember(playerId);
        if (m == null || locked(playerId) || !Double.isFinite(tx) || !Double.isFinite(tz)) {
            return;
        }
        m.targetX = clamp(tx, Obstacles.MIN_X, Obstacles.MAX_X);
        m.targetZ = clamp(tz, Obstacles.MIN_Z, Obstacles.MAX_Z);
        m.dirX = 0;
        m.dirZ = 0;
    }

    /** 조이스틱: 방향과 세기(최대 1). 0이면 멈춤 */
    public synchronized void steer(UUID playerId, double dx, double dz) {
        Member m = onlineMember(playerId);
        if (m == null || locked(playerId) || !Double.isFinite(dx) || !Double.isFinite(dz)) {
            return;
        }
        double len = Math.hypot(dx, dz);
        if (len > 1) {
            dx /= len;
            dz /= len;
        }
        m.dirX = dx;
        m.dirZ = dz;
        m.targetX = null;
        m.targetZ = null;
    }

    /** @return 바뀌었으면 true */
    public synchronized boolean setAway(UUID playerId, boolean away) {
        Member m = onlineMember(playerId);
        if (m == null || m.away == away) {
            return false;
        }
        m.away = away;
        return true;
    }

    /** 1초에 한 번까지. @return 보내도 되면 true */
    public synchronized boolean allowChat(UUID playerId, Instant now) {
        Member m = onlineMember(playerId);
        if (m == null || Duration.between(m.lastChatAt, now).compareTo(CHAT_INTERVAL) < 0) {
            return false;
        }
        m.lastChatAt = now;
        m.away = false;
        return true;
    }

    /** 방장이 다른 사람에게 넘김. @return 넘겨졌으면 true */
    public synchronized boolean transferHost(UUID from, UUID to) {
        if (!from.equals(hostId) || from.equals(to)) {
            return false;
        }
        Member target = onlineMember(to);
        if (target == null) {
            return false;
        }
        hostId = to;
        hostAbsentSince = null;
        return true;
    }

    /** 위치 계산과 방장 자동 넘김. 0.1초마다 호출된다. */
    public synchronized TickResult tick(double dt, Instant now) {
        boolean moved = false;
        for (Member m : members.values()) {
            if (!m.online()) {
                continue;
            }
            boolean was = m.moving;
            m.moving = step(m, dt);
            moved |= m.moving || was;
        }
        List<Match.Event> matchEvents = List.of();
        if (match != null) {
            matchEvents = match.advanceTo(now, this::boothOf, eligiblePlayers(),
                    id -> {
                        Member m = members.get(id);
                        return m != null && m.online();
                    },
                    this::placeInCircle, this::stepOut);
            if (matchEvents.stream().anyMatch(e -> e instanceof Match.Finished)) {
                match = null;
            }
        }
        boolean presence = false;
        if (hostId != null && hostAbsentSince != null
                && Duration.between(hostAbsentSince, now).compareTo(HOST_GRACE) >= 0) {
            hostId = nextHost();
            hostAbsentSince = null;
            presence = true;
            if (hostId == null) {
                // 아무도 없으면 하루가 끝난 것으로 보고 도착 순서를 새로 시작
                members.clear();
                arrivalCounter = 0;
            }
        }
        return new TickResult(moved, presence, matchEvents);
    }

    // ---------- 내기 (투표 → 연속 판) ----------


    /** 방장이 게임 고르기를 시작. 10초 투표 후 진행된다. */
    public synchronized Object startMatch(UUID by, int winnersTarget, boolean practice, Instant now) {
        if (!by.equals(hostId)) {
            return StartFailure.NOT_HOST;
        }
        if (match != null) {
            return StartFailure.ALREADY_RUNNING;
        }
        if (eligiblePlayers().size() < 2) {
            return StartFailure.NOT_ENOUGH_PLAYERS;
        }
        match = new Match(Math.max(1, winnersTarget), practice, now, random);
        return match.started();
    }

    public synchronized BombGame.PassResult passBomb(UUID playerId, Instant now) {
        if (match == null || !(match.game() instanceof BombGame bomb)) {
            return BombGame.PassResult.OVER;
        }
        return bomb.pass(playerId, now);
    }

    public synchronized Optional<UUID> bombHolder() {
        if (match == null || !(match.game() instanceof BombGame bomb) || bomb.exploded()) {
            return Optional.empty();
        }
        return Optional.of(bomb.holder());
    }

    /** 풍선 펌프질. 결과 소식은 다음 틱(0.1초 안)에 방송된다. */
    public synchronized BalloonGame.PumpResult pumpBalloon(UUID playerId, int pumps, Instant now) {
        if (match == null || !(match.game() instanceof BalloonGame balloon)) {
            return BalloonGame.PumpResult.OVER;
        }
        return balloon.pump(playerId, pumps, now);
    }

    /** 경쟁 게임 점수 제출. 진행 소식은 다음 틱에 방송된다. */
    public synchronized SkillGame.SubmitResult submitSkill(UUID playerId, double score, Double extra, Instant now) {
        if (match == null || !(match.game() instanceof SkillGame skill)) {
            return SkillGame.SubmitResult.LATE;
        }
        return skill.submit(playerId, score, extra, now);
    }

    /** 혼자 연습: 그 게임 부스 위에 서 있고, 내기가 진행 중이 아닐 때만 */
    public synchronized boolean canPractice(UUID playerId, String gameType) {
        Member m = onlineMember(playerId);
        if (m == null || match != null || !SkillGame.isSkill(gameType)) {
            return false;
        }
        Match.Booth b = Match.Booth.at(m.x, m.z);
        return b != null && b.name().equals(gameType);
    }

    /** 진행 중인 판 (늦게 들어온 사람, 재접속한 사람에게 다시 알려 줄 때) */
    public synchronized Optional<Match.RoundStarted> roundInProgress() {
        return match == null ? Optional.empty() : Optional.ofNullable(match.currentRound());
    }

    /** 투표 중이면 남은 시간 */
    public synchronized Optional<Match.VoteStarted> voteInProgress(Instant now) {
        if (match == null || match.phase() != Match.Phase.VOTING) {
            return Optional.empty();
        }
        long left = Math.max(0, Duration.between(now, match.phaseEndsAt()).toMillis());
        return Optional.of(new Match.VoteStarted(left, match.winnersTarget(), match.practice()));
    }

    private boolean locked(UUID id) {
        return match != null && match.locks(id);
    }

    /** 게임에 참가할 수 있는 사람: 접속 중이고 자리비움이 아님. 먼저 온 순서 */
    private List<UUID> eligiblePlayers() {
        return members.values().stream()
                .filter(m -> m.online() && !m.away)
                .sorted(Comparator.comparingLong(m -> m.arrivalOrder))
                .map(m -> m.id)
                .toList();
    }

    private Match.Booth boothOf(UUID id) {
        Member m = members.get(id);
        if (m == null) {
            return null;
        }
        return Match.Booth.at(m.x, m.z);
    }

    /** 당첨자는 원 밖으로 걸어 나간다 */
    private void stepOut(UUID id) {
        Member m = members.get(id);
        if (m == null) {
            return;
        }
        double dx = m.x - BOMB_CENTER_X;
        double dz = m.z - BOMB_CENTER_Z;
        double len = Math.max(0.01, Math.hypot(dx, dz));
        double tx = m.x + dx / len * 1.3;
        double tz = m.z + dz / len * 1.3;
        if (!Obstacles.blocked(tx, tz)) {
            m.targetX = tx;
            m.targetZ = tz;
        }
    }

    /** 참가자를 순서대로 둥글게 세운다 */
    private void placeInCircle(List<UUID> order) {
        int n = order.size();
        double radius = Math.max(1.6, n * 0.33);
        for (int i = 0; i < n; i++) {
            Member m = members.get(order.get(i));
            double a = (double) i / n * Math.PI * 2;
            double x = BOMB_CENTER_X + Math.sin(a) * radius;
            double z = BOMB_CENTER_Z + Math.cos(a) * radius;
            if (!Obstacles.blocked(x, z)) {
                m.x = x;
                m.z = z;
            }
            m.face = Math.atan2(BOMB_CENTER_X - m.x, BOMB_CENTER_Z - m.z);
            m.targetX = null;
            m.targetZ = null;
            m.dirX = 0;
            m.dirZ = 0;
            m.moving = false;
        }
    }

    private boolean step(Member m, double dt) {
        double dx;
        double dz;
        double speed = SPEED;
        if (m.dirX != 0 || m.dirZ != 0) {
            double mag = Math.hypot(m.dirX, m.dirZ);
            if (mag < 0.05) {
                return false;
            }
            dx = m.dirX / mag;
            dz = m.dirZ / mag;
            speed *= Math.min(1, mag);
        } else if (m.targetX != null) {
            dx = m.targetX - m.x;
            dz = m.targetZ - m.z;
            double d = Math.hypot(dx, dz);
            if (d < 0.05) {
                m.targetX = null;
                m.targetZ = null;
                return false;
            }
            speed = Math.min(speed, d / dt);
            dx /= d;
            dz /= d;
        } else {
            return false;
        }
        double nx = m.x + dx * speed * dt;
        double nz = m.z + dz * speed * dt;
        // 장애물에 막히면 벽을 따라 미끄러진다
        if (!Obstacles.blocked(nx, nz)) {
            m.x = nx;
            m.z = nz;
        } else if (!Obstacles.blocked(nx, m.z)) {
            m.x = nx;
        } else if (!Obstacles.blocked(m.x, nz)) {
            m.z = nz;
        } else {
            m.targetX = null;
            m.targetZ = null;
            return false;
        }
        m.face = Math.atan2(dx, dz);
        m.away = false;
        return true;
    }

    private UUID nextHost() {
        return members.values().stream()
                .filter(Member::online)
                .min(Comparator.comparingLong(m -> m.arrivalOrder))
                .map(m -> m.id)
                .orElse(null);
    }

    public synchronized List<PositionView> positions() {
        List<PositionView> out = new ArrayList<>();
        for (Member m : members.values()) {
            if (m.online()) {
                out.add(new PositionView(m.id, round(m.x), round(m.z), round(m.face), m.moving));
            }
        }
        return out;
    }

    /** 먼저 온 순서 */
    public synchronized PresenceView presence() {
        List<MemberView> list = members.values().stream()
                .filter(Member::online)
                .sorted(Comparator.comparingLong(m -> m.arrivalOrder))
                .map(m -> new MemberView(m.id, m.nickname, m.characterIndex, m.away))
                .toList();
        return new PresenceView(list, hostId);
    }

    public synchronized Optional<UUID> host() {
        return Optional.ofNullable(hostId);
    }

    private Member onlineMember(UUID id) {
        Member m = members.get(id);
        return m != null && m.online() ? m : null;
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
