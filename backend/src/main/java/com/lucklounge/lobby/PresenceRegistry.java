package com.lucklounge.lobby;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 팀별로 지금 접속해 있는 사람. 한 사람이 휴대폰 두 대로 들어와도 한 명으로 센다.
 * 메모리에만 있고 서버가 재시작되면 비워진다 (휴대폰이 자동 재접속하면서 다시 채워짐).
 */
@Component
public class PresenceRegistry {

    public record OnlinePlayer(UUID playerId, String nickname, int characterIndex) {
    }

    private record Entry(String sessionId, LoungePrincipal principal, long connectedAt) {
    }

    private final Map<String, Map<String, Entry>> byTeam = new ConcurrentHashMap<>();

    public void connected(String sessionId, LoungePrincipal principal, long connectedAt) {
        byTeam.computeIfAbsent(principal.teamSlug(), k -> new ConcurrentHashMap<>())
                .put(sessionId, new Entry(sessionId, principal, connectedAt));
    }

    /** @return 세션이 속해 있던 팀. 모르는 세션이면 null */
    public String disconnected(String sessionId) {
        for (Map.Entry<String, Map<String, Entry>> team : byTeam.entrySet()) {
            if (team.getValue().remove(sessionId) != null) {
                return team.getKey();
            }
        }
        return null;
    }

    /** 먼저 들어온 순서. 같은 사람의 여러 세션은 가장 최근 닉네임으로 하나만. */
    public List<OnlinePlayer> online(String teamSlug) {
        Map<String, Entry> sessions = byTeam.getOrDefault(teamSlug, Map.of());
        Map<UUID, Entry> first = new LinkedHashMap<>();
        Map<UUID, Entry> latest = new LinkedHashMap<>();
        sessions.values().stream()
                .sorted(Comparator.comparingLong(Entry::connectedAt))
                .forEach(e -> {
                    first.putIfAbsent(e.principal().playerId(), e);
                    latest.put(e.principal().playerId(), e);
                });
        return first.keySet().stream()
                .map(id -> latest.get(id).principal())
                .map(p -> new OnlinePlayer(p.playerId(), p.nickname(), p.characterIndex()))
                .toList();
    }
}
