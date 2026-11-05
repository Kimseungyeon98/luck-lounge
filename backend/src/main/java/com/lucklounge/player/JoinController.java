package com.lucklounge.player;

import com.lucklounge.player.JoinService.JoinCommand;
import com.lucklounge.player.JoinService.Joined;
import com.lucklounge.player.JoinService.PlayerView;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/teams/{slug}")
class JoinController {

    static final String TOKEN_HEADER = "X-Device-Token";

    private final JoinService joinService;

    JoinController(JoinService joinService) {
        this.joinService = joinService;
    }

    /** 이 기기로 전에 들어온 적 있으면 그 사람의 닉네임·캐릭터 (입장 화면 미리 채우기). 없으면 204. */
    @GetMapping("/me")
    ResponseEntity<PlayerView> me(@PathVariable String slug,
                                  @RequestHeader(name = TOKEN_HEADER, required = false) String token) {
        return joinService.me(slug, token).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** "이어하기"용 팀원 목록 */
    @GetMapping("/players")
    List<PlayerView> players(@PathVariable String slug) {
        return joinService.members(slug);
    }

    @PostMapping("/join")
    Joined join(@PathVariable String slug,
                @RequestHeader(name = TOKEN_HEADER, required = false) String token,
                @RequestBody JoinRequest request) {
        return joinService.join(slug, token,
                new JoinCommand(request.nickname(), request.characterIndex(), request.resumePlayerId()));
    }

    record JoinRequest(String nickname, Integer characterIndex, UUID resumePlayerId) {
    }
}
