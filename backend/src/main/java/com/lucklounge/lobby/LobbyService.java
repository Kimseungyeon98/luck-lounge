package com.lucklounge.lobby;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * 팀별 대기실을 관리하고, 0.1초마다 위치를 계산해 방송한다.
 * <ul>
 *   <li>/topic/t/{팀}/lobby    : 위치 (움직임이 있을 때만, 최대 10회/초)</li>
 *   <li>/topic/t/{팀}/presence : 접속자·방장·자리비움 (바뀔 때)</li>
 *   <li>/topic/t/{팀}/events   : 말풍선, 이모티콘, 방장 변경 안내</li>
 * </ul>
 */
@Service
public class LobbyService implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(LobbyService.class);
    static final long TICK_MS = 100;
    static final Set<String> EMOTES = Set.of("👋", "😂", "🔥", "🙏", "😴", "👏");

    public record PositionsMessage(java.util.List<LobbyRoom.PositionView> players) {
    }

    public record LobbyEvent(String type, UUID playerId, String text) {
    }

    /** /topic/t/{팀}/bomb 으로 나가는 시한폭탄 소식. type: start | holder | explode | finish */
    public record BombMessage(String type, java.util.List<UUID> order, UUID holder, Double centerX, Double centerZ,
                              Boolean auto, UUID loser, Long heldMs) {

        static BombMessage of(BombGame.Event e) {
            return switch (e) {
                case BombGame.Started s -> new BombMessage("start", s.order(), s.holder(), s.centerX(), s.centerZ(), null, null, null);
                case BombGame.HolderChanged h -> new BombMessage("holder", null, h.holder(), null, null, h.auto(), null, null);
                case BombGame.Exploded x -> new BombMessage("explode", null, null, null, null, null, x.loser(), x.heldMs());
                case BombGame.Finished f -> new BombMessage("finish", null, null, null, null, null, null, null);
            };
        }
    }

    /** 나에게만 보내는 안내 */
    public record PersonalNotice(String type, String message) {
    }

    private final Map<String, LobbyRoom> rooms = new ConcurrentHashMap<>();
    private final SimpMessagingTemplate messaging;
    private final ChatFilter chatFilter;
    private final Clock clock;
    private ScheduledExecutorService ticker;
    private volatile boolean running;

    LobbyService(SimpMessagingTemplate messaging, ChatFilter chatFilter, Clock clock) {
        this.messaging = messaging;
        this.chatFilter = chatFilter;
        this.clock = clock;
    }

    public LobbyRoom room(String teamSlug) {
        return rooms.computeIfAbsent(teamSlug, LobbyRoom::new);
    }

    // ---------- 접속과 퇴장 ----------

    @EventListener
    void onConnected(SessionConnectedEvent event) {
        if (event.getUser() instanceof LoungePrincipal p) {
            String sessionId = (String) event.getMessage().getHeaders().get("simpSessionId");
            room(p.teamSlug()).join(sessionId, p.playerId(), p.nickname(), p.characterIndex());
            broadcastPresence(p.teamSlug());
        }
    }

    @EventListener
    void onDisconnected(SessionDisconnectEvent event) {
        for (LobbyRoom room : rooms.values()) {
            if (room.contains(event.getSessionId())) {
                if (room.leave(event.getSessionId(), clock.instant())) {
                    broadcastPresence(room.teamSlug());
                    broadcastPositions(room);
                }
                return;
            }
        }
    }

    // ---------- 휴대폰에서 온 요청 ----------

    public void sync(String team) {
        broadcastPresence(team);
        broadcastPositions(room(team));
        room(team).bombInProgress().ifPresent(s -> bombEvent(team, s));
    }

    public void startBomb(LoungePrincipal p) {
        Object result = room(p.teamSlug()).startBomb(p.playerId(), clock.instant());
        if (result instanceof BombGame.Started started) {
            broadcastPositions(room(p.teamSlug()));
            bombEvent(p.teamSlug(), started);
        } else {
            String message = switch ((LobbyRoom.StartFailure) result) {
                case NOT_HOST -> "방장만 시작할 수 있어요.";
                case ALREADY_RUNNING -> "이미 게임이 진행 중이에요.";
                case NOT_ENOUGH_PLAYERS -> "2명 이상 모여야 시작할 수 있어요.";
            };
            notice(p, "error", message);
        }
    }

    public void passBomb(LoungePrincipal p) {
        switch (room(p.teamSlug()).passBomb(p.playerId(), clock.instant())) {
            case PASSED -> room(p.teamSlug()).bombHolder()
                    .ifPresent(h -> bombEvent(p.teamSlug(), new BombGame.HolderChanged(h, false)));
            case TOO_EARLY -> notice(p, "too-early", "받고 1초가 지나야 넘길 수 있어요.");
            default -> { }
        }
    }

    public void move(LoungePrincipal p, Double tx, Double tz, Double dx, Double dz) {
        LobbyRoom room = room(p.teamSlug());
        boolean wasAway = room.setAway(p.playerId(), false);
        if (tx != null && tz != null) {
            room.moveTo(p.playerId(), tx, tz);
        } else {
            room.steer(p.playerId(), dx == null ? 0 : dx, dz == null ? 0 : dz);
        }
        if (wasAway) {
            broadcastPresence(p.teamSlug());
        }
    }

    public void chat(LoungePrincipal p, String text) {
        chatFilter.clean(text).ifPresent(clean -> {
            LobbyRoom room = room(p.teamSlug());
            if (room.allowChat(p.playerId(), clock.instant())) {
                event(p.teamSlug(), new LobbyEvent("chat", p.playerId(), clean));
            }
        });
    }

    public void emote(LoungePrincipal p, String emoji) {
        if (emoji != null && EMOTES.contains(emoji) && room(p.teamSlug()).allowChat(p.playerId(), clock.instant())) {
            event(p.teamSlug(), new LobbyEvent("emote", p.playerId(), emoji));
        }
    }

    public void away(LoungePrincipal p, boolean away) {
        if (room(p.teamSlug()).setAway(p.playerId(), away)) {
            broadcastPresence(p.teamSlug());
        }
    }

    public void transferHost(LoungePrincipal p, UUID to) {
        if (to != null && room(p.teamSlug()).transferHost(p.playerId(), to)) {
            broadcastPresence(p.teamSlug());
            event(p.teamSlug(), new LobbyEvent("host", to, "transfer"));
        }
    }

    // ---------- 0.1초 틱 ----------

    void tick(double dt) {
        Instant now = clock.instant();
        for (LobbyRoom room : rooms.values()) {
            try {
                LobbyRoom.TickResult r = room.tick(dt, now);
                if (r.positionsChanged()) {
                    broadcastPositions(room);
                }
                for (BombGame.Event e : r.bombEvents()) {
                    bombEvent(room.teamSlug(), e);
                }
                if (r.presenceChanged()) {
                    broadcastPresence(room.teamSlug());
                    room.host().ifPresent(h -> event(room.teamSlug(), new LobbyEvent("host", h, "auto")));
                }
            } catch (RuntimeException e) {
                log.warn("대기실 틱 처리 실패: {}", room.teamSlug(), e);
            }
        }
    }

    private void broadcastPositions(LobbyRoom room) {
        messaging.convertAndSend("/topic/t/" + room.teamSlug() + "/lobby", new PositionsMessage(room.positions()));
    }

    private void broadcastPresence(String team) {
        messaging.convertAndSend("/topic/t/" + team + "/presence", room(team).presence());
    }

    private void bombEvent(String team, BombGame.Event e) {
        messaging.convertAndSend("/topic/t/" + team + "/bomb", BombMessage.of(e));
    }

    private void notice(LoungePrincipal p, String type, String message) {
        messaging.convertAndSendToUser(p.getName(), "/queue/me", new PersonalNotice(type, message));
    }

    private void event(String team, LobbyEvent e) {
        messaging.convertAndSend("/topic/t/" + team + "/events", e);
    }

    // ---------- 틱 스레드 ----------

    @Override
    public void start() {
        ticker = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "lobby-tick");
            t.setDaemon(true);
            return t;
        });
        long[] last = {System.nanoTime()};
        ticker.scheduleAtFixedRate(() -> {
            long now = System.nanoTime();
            double dt = Math.min(0.25, (now - last[0]) / 1e9);
            last[0] = now;
            tick(dt);
        }, TICK_MS, TICK_MS, TimeUnit.MILLISECONDS);
        running = true;
    }

    @Override
    public void stop() {
        if (ticker != null) {
            ticker.shutdownNow();
        }
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }
}
