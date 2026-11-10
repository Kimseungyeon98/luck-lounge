package com.lucklounge.team;

import com.lucklounge.web.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
class TeamController {

    private final TeamRepository teams;
    private final RoomService rooms;

    TeamController(TeamRepository teams, RoomService rooms) {
        this.teams = teams;
        this.rooms = rooms;
    }

    /** 내부 열쇠(slug)로 방 정보. 최근 방 카드로 다시 들어올 때 쓴다 */
    @GetMapping("/api/teams/{slug}")
    RoomService.Room get(@PathVariable String slug) {
        return teams.findBySlug(slug).map(RoomService.Room::of)
                .orElseThrow(() -> new NotFoundException("없어진 방이에요. 방 코드를 다시 입력해 주세요."));
    }

    /** 방 코드 입력 */
    @GetMapping("/api/rooms/{code}")
    RoomService.Room find(@PathVariable String code, HttpServletRequest request) {
        return rooms.find(code, request.getRemoteAddr());
    }

    /** 새 방 만들기 */
    @PostMapping("/api/rooms")
    RoomService.Room create(@RequestBody CreateRoom body, @RequestHeader(name = "X-Device-Key", required = false) String deviceKey,
            HttpServletRequest request) {
        return rooms.create(body.name(), deviceKey, request.getRemoteAddr());
    }

    record CreateRoom(String name) {
    }
}
