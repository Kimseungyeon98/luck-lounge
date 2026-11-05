package com.lucklounge.team;

import com.lucklounge.web.NotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/teams")
class TeamController {

    private final TeamRepository teams;

    TeamController(TeamRepository teams) {
        this.teams = teams;
    }

    @GetMapping("/{slug}")
    TeamResponse get(@PathVariable String slug) {
        Team team = teams.findBySlug(slug).orElseThrow(() -> new NotFoundException("없는 팀 링크예요. 링크를 다시 확인해 주세요."));
        return new TeamResponse(team.getSlug(), team.getName());
    }

    record TeamResponse(String slug, String name) {
    }
}
