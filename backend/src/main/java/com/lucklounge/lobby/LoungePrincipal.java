package com.lucklounge.lobby;

import java.security.Principal;
import java.util.UUID;

/** WebSocket 세션의 주인. 이름(getName)은 플레이어 ID라서 /user/queue 로 개인 메시지를 보낼 수 있다. */
public record LoungePrincipal(String teamSlug, UUID playerId, String nickname, int characterIndex) implements Principal {

    @Override
    public String getName() {
        return playerId.toString();
    }
}
