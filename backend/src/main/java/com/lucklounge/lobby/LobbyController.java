package com.lucklounge.lobby;

import java.security.Principal;
import java.util.UUID;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

/** 대기실 STOMP 요청. 주소의 팀이 자기 팀인지는 StompAuthInterceptor 가 이미 확인했다. */
@Controller
class LobbyController {

    record MoveCommand(Double tx, Double tz, Double dx, Double dz) {
    }

    record ChatCommand(String text) {
    }

    record EmoteCommand(String emoji) {
    }

    record AwayCommand(boolean away) {
    }

    record TransferCommand(UUID playerId) {
    }

    private final LobbyService lobby;

    LobbyController(LobbyService lobby) {
        this.lobby = lobby;
    }

    @MessageMapping("/t/{team}/presence/sync")
    void sync(@DestinationVariable String team) {
        lobby.sync(team);
    }

    @MessageMapping("/t/{team}/move")
    void move(@Payload MoveCommand cmd, Principal principal) {
        lobby.move(me(principal), cmd.tx(), cmd.tz(), cmd.dx(), cmd.dz());
    }

    @MessageMapping("/t/{team}/chat")
    void chat(@Payload ChatCommand cmd, Principal principal) {
        lobby.chat(me(principal), cmd.text());
    }

    @MessageMapping("/t/{team}/emote")
    void emote(@Payload EmoteCommand cmd, Principal principal) {
        lobby.emote(me(principal), cmd.emoji());
    }

    @MessageMapping("/t/{team}/away")
    void away(@Payload AwayCommand cmd, Principal principal) {
        lobby.away(me(principal), cmd.away());
    }

    @MessageMapping("/t/{team}/host/transfer")
    void transfer(@Payload TransferCommand cmd, Principal principal) {
        lobby.transferHost(me(principal), cmd.playerId());
    }

    private static LoungePrincipal me(Principal principal) {
        return (LoungePrincipal) principal;
    }
}
