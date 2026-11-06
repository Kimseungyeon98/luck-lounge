package com.lucklounge.lobby;

import com.lucklounge.player.JoinService;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * STOMP 접속 인증과 구독 제한.
 * <ul>
 *   <li>CONNECT: 헤더 team, token 으로 사람을 확인하고 세션 주인으로 지정</li>
 *   <li>SUBSCRIBE/SEND: 자기 팀 주소(/topic/t/{팀}/, /app/t/{팀}/)와 개인 큐(/user/)만 허용</li>
 * </ul>
 */
@Component
public class StompAuthInterceptor implements ChannelInterceptor {

    private final JoinService joinService;

    StompAuthInterceptor(JoinService joinService) {
        this.joinService = joinService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT) {
            String team = accessor.getFirstNativeHeader("team");
            String token = accessor.getFirstNativeHeader("token");
            LoungePrincipal principal = joinService.authenticate(team, token)
                    .map(p -> new LoungePrincipal(team, p.playerId(), p.nickname(), p.characterIndex()))
                    .orElseThrow(() -> new MessageDeliveryException("입장 정보가 올바르지 않아요. 다시 입장해 주세요."));
            accessor.setUser(principal);
        } else if (command == StompCommand.SUBSCRIBE || command == StompCommand.SEND) {
            if (!(accessor.getUser() instanceof LoungePrincipal principal)) {
                throw new MessageDeliveryException("입장 후에 이용할 수 있어요.");
            }
            String destination = accessor.getDestination();
            if (destination == null || !allowed(destination, principal.teamSlug())) {
                throw new MessageDeliveryException("허용되지 않은 주소예요: " + destination);
            }
        }
        return message;
    }

    static boolean allowed(String destination, String teamSlug) {
        return destination.startsWith("/topic/t/" + teamSlug + "/")
                || destination.startsWith("/app/t/" + teamSlug + "/")
                || destination.startsWith("/user/queue/");
    }
}
