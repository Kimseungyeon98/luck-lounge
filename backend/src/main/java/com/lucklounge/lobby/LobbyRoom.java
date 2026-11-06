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

    /** 틱 한 번의 결과: 위치가 바뀌었는지, 접속자·방장 정보가 바뀌었는지 */
    public record TickResult(boolean positionsChanged, boolean presenceChanged) {
    }

    private final String teamSlug;
    private final Map<UUID, Member> members = new LinkedHashMap<>();
    private final Map<String, UUID> sessionOwner = new HashMap<>();
    private long arrivalCounter;
    private UUID hostId;
    private Instant hostAbsentSince;

    public LobbyRoom(String teamSlug) {
        this.teamSlug = teamSlug;
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
        if (m == null || !Double.isFinite(tx) || !Double.isFinite(tz)) {
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
        if (m == null || !Double.isFinite(dx) || !Double.isFinite(dz)) {
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
        return new TickResult(moved, presence);
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
