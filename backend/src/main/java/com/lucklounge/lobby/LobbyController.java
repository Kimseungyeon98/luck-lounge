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

    record MatchCommand(Integer winnersTarget, Boolean practice) {
    }

    @MessageMapping("/t/{team}/match/start")
    void startMatch(@Payload MatchCommand cmd, Principal principal) {
        lobby.startMatch(me(principal), cmd.winnersTarget() == null ? 1 : cmd.winnersTarget(),
                Boolean.TRUE.equals(cmd.practice()));
    }

    record PumpCommand(Integer pumps) {
    }

    @MessageMapping("/t/{team}/balloon/pump")
    void pump(@Payload PumpCommand cmd, Principal principal) {
        lobby.pumpBalloon(me(principal), cmd.pumps() == null ? 1 : cmd.pumps());
    }

    record SkillCommand(String gameType, Double score, Double extra) {
    }

    /** 내기 중 경쟁 게임 점수 */
    @MessageMapping("/t/{team}/skill/score")
    void skillScore(@Payload SkillCommand cmd, Principal principal) {
        if (cmd.score() != null) {
            lobby.submitSkill(me(principal), cmd.score(), cmd.extra());
        }
    }

    /** 부스 위에서 혼자 연습한 점수 */
    @MessageMapping("/t/{team}/skill/practice")
    void skillPractice(@Payload SkillCommand cmd, Principal principal) {
        if (cmd.score() != null) {
            lobby.practice(me(principal), cmd.gameType(), cmd.score(), cmd.extra());
        }
    }

        record LadderCommand(Integer column) {
    }

    @MessageMapping("/t/{team}/ladder/pick")
    void pickLadder(@Payload LadderCommand cmd, Principal principal) {
        if (cmd.column() != null) {
            lobby.pickLadder(me(principal), cmd.column());
        }
    }

        @MessageMapping("/t/{team}/bomb/pass")
    void passBomb(Principal principal) {
        lobby.passBomb(me(principal));
    }

    private static LoungePrincipal me(Principal principal) {
        return (LoungePrincipal) principal;
    }
}
