package com.lucklounge.lobby;

import java.time.Clock;
import java.time.Instant;
import com.lucklounge.record.GameRecords;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
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
    private final GameRecords records;
    /** 기록은 순서대로, 틱 스레드를 막지 않게 별도 스레드 하나에서 쓴다 */
    private final ExecutorService recordWriter = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "game-records");
        t.setDaemon(true);
        return t;
    });
    /** 팀별로 진행 중인 내기의 DB id (recordWriter 스레드에서만 사용) */
    private final Map<String, Long> openSessions = new java.util.HashMap<>();
    private ScheduledExecutorService ticker;
    private volatile boolean running;

    LobbyService(SimpMessagingTemplate messaging, ChatFilter chatFilter, Clock clock, GameRecords records) {
        this.messaging = messaging;
        this.chatFilter = chatFilter;
        this.clock = clock;
        this.records = records;
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
        room(team).voteInProgress(clock.instant()).ifPresent(v -> matchMessage(team, voteMessage(v)));
        room(team).roundInProgress().ifPresent(r -> {
            Map<String, Object> m = msg("round", "round", r.round());
            m.put("gameType", r.gameType());
            matchMessage(team, m);
            gameEvent(team, r.start());
        });
    }

    public void startMatch(LoungePrincipal p, int winnersTarget, boolean practice) {
        Object result = room(p.teamSlug()).startMatch(p.playerId(), winnersTarget, practice, clock.instant());
        if (result instanceof Match.VoteStarted started) {
            matchMessage(p.teamSlug(), voteMessage(started));
        } else {
            notice(p, "error", failureMessage((LobbyRoom.StartFailure) result));
        }
    }

    private static String failureMessage(LobbyRoom.StartFailure f) {
        return switch (f) {
            case NOT_HOST -> "방장만 시작할 수 있어요.";
            case ALREADY_RUNNING -> "이미 진행 중이에요.";
            case NOT_ENOUGH_PLAYERS -> "2명 이상 모여야 시작할 수 있어요.";
        };
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
                for (Match.Event e : r.matchEvents()) {
                    onMatchEvent(room, e);
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

    // ---------- 내기 진행 방송과 기록 ----------

    private void onMatchEvent(LobbyRoom room, Match.Event e) {
        String team = room.teamSlug();
        switch (e) {
            case Match.VoteStarted v -> matchMessage(team, voteMessage(v));
            case Match.VoteEnded v -> {
                Map<String, Object> m = msg("voteResult", "bomb", v.bomb());
                m.put("balloon", v.balloon());
                m.put("abstain", v.abstain());
                m.put("won", v.won().name());
                m.put("gameType", v.gameType());
                m.put("winnersTarget", v.winnersTarget());
                m.put("participants", v.participants().size());
                matchMessage(team, m);
                recordWriter.execute(() -> safely(() -> openSessions.put(team, records.startSession(team, v.gameType(),
                        v.winnersTarget(), v.practice(), v.bomb(), v.balloon(), v.at()))));
            }
            case Match.Cancelled c -> matchMessage(team, msg("cancel", "message", c.reason()));
            case Match.RoundStarted r -> {
                broadcastPositions(room);
                Map<String, Object> m = msg("round", "round", r.round());
                m.put("gameType", r.gameType());
                matchMessage(team, m);
                gameEvent(team, r.start());
            }
            case Match.GameEvent g -> gameEvent(team, g.event());
            case Match.RoundEnded r -> {
                PartyGame.Outcome o = r.outcome();
                Map<String, Object> m = msg("roundEnd", "round", r.round());
                m.put("gameType", r.gameType());
                m.put("loser", o.loser());
                m.put("heldMs", o.heldMs());
                m.put("pumpCount", o.pumpCount());
                m.put("pumpLimit", o.pumpLimit());
                m.put("remaining", r.remaining());
                m.put("more", r.more());
                matchMessage(team, m);
                recordWriter.execute(() -> safely(() -> {
                    Long session = openSessions.get(team);
                    if (session != null) {
                        records.saveRound(session, r.round(), o.loser(), o.heldMs(), o.pumpCount(), o.pumpLimit(), o.at(), r.players());
                    }
                }));
            }
            case Match.Summary s -> {
                Map<String, Object> m = msg("summary", "participants", s.participants());
                m.put("gameType", s.gameType());
                m.put("practice", s.practice());
                m.put("winners", s.winners());
                matchMessage(team, m);
            }
            case Match.Finished f -> {
                matchMessage(team, msg("finish", "at", f.at().toEpochMilli()));
                recordWriter.execute(() -> safely(() -> {
                    Long session = openSessions.remove(team);
                    if (session != null) {
                        records.endSession(session, f.at());
                    }
                }));
            }
        }
    }

    private static Map<String, Object> voteMessage(Match.VoteStarted v) {
        Map<String, Object> m = msg("vote", "endsInMs", v.endsInMs());
        m.put("winnersTarget", v.winnersTarget());
        m.put("practice", v.practice());
        return m;
    }

    private static Map<String, Object> msg(String type, String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        m.put(key, value);
        return m;
    }

    private void matchMessage(String team, Map<String, Object> m) {
        messaging.convertAndSend("/topic/t/" + team + "/match", (Object) m);
    }

    private static void safely(Runnable r) {
        try {
            r.run();
        } catch (RuntimeException e) {
            log.warn("내기 기록 저장 실패", e);
        }
    }

    /** 판 안의 소식: 시한폭탄은 /bomb, 풍선은 /balloon */
    private void gameEvent(String team, PartyGame.GameEvent e) {
        if (e instanceof BombGame.Event b) {
            bombEvent(team, b);
        } else if (e instanceof BalloonGame.Event b) {
            messaging.convertAndSend("/topic/t/" + team + "/balloon", (Object) balloonMessage(b));
        }
    }

    private static Map<String, Object> balloonMessage(BalloonGame.Event e) {
        return switch (e) {
            case BalloonGame.Started s -> {
                Map<String, Object> m = msg("start", "order", s.order());
                m.put("turn", s.turn());
                m.put("count", s.count());
                m.put("limitMin", s.limitMin());
                m.put("limitMax", s.limitMax());
                m.put("centerX", s.centerX());
                m.put("centerZ", s.centerZ());
                yield m;
            }
            case BalloonGame.Turn t -> msg("turn", "player", t.player());
            case BalloonGame.Pumped p -> {
                Map<String, Object> m = msg("pump", "player", p.player());
                m.put("pumps", p.pumps());
                m.put("count", p.count());
                m.put("auto", p.auto());
                yield m;
            }
            case BalloonGame.Popped p -> {
                Map<String, Object> m = msg("pop", "loser", p.loser());
                m.put("count", p.count());
                m.put("limit", p.limit());
                yield m;
            }
        };
    }

    public void pumpBalloon(LoungePrincipal p, int pumps) {
        switch (room(p.teamSlug()).pumpBalloon(p.playerId(), pumps, clock.instant())) {
            case NOT_YOUR_TURN -> notice(p, "not-your-turn", "아직 내 차례가 아니에요.");
            case INVALID -> notice(p, "error", "1~3번 중에 골라 주세요.");
            default -> { }
        }
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
        recordWriter.shutdown();
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }
}
