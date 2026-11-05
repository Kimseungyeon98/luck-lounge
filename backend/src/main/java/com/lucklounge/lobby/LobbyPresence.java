package com.lucklounge.lobby;

import com.lucklounge.lobby.PresenceRegistry.OnlinePlayer;
import java.security.Principal;
import java.util.List;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * 대기실 접속자 목록.
 * 휴대폰은 /topic/t/{팀}/presence 를 구독한 뒤 /app/t/{팀}/presence/sync 를 보내 현재 목록을 받는다.
 * 누가 나가면 남은 사람들에게 다시 방송한다.
 */
@Controller
class LobbyPresence {

    record PresenceMessage(List<OnlinePlayer> players) {
    }

    private final PresenceRegistry registry;
    private final SimpMessagingTemplate messaging;

    LobbyPresence(PresenceRegistry registry, SimpMessagingTemplate messaging) {
        this.registry = registry;
        this.messaging = messaging;
    }

    @EventListener
    void onConnected(SessionConnectedEvent event) {
        if (event.getUser() instanceof LoungePrincipal principal) {
            String sessionId = (String) event.getMessage().getHeaders().get("simpSessionId");
            registry.connected(sessionId, principal, event.getTimestamp());
        }
    }

    @EventListener
    void onDisconnected(SessionDisconnectEvent event) {
        String team = registry.disconnected(event.getSessionId());
        if (team != null) {
            broadcast(team);
        }
    }

    @MessageMapping("/t/{team}/presence/sync")
    void sync(@DestinationVariable String team, Principal principal) {
        broadcast(team);
    }

    private void broadcast(String team) {
        messaging.convertAndSend("/topic/t/" + team + "/presence", new PresenceMessage(registry.online(team)));
    }
}
