package com.lucklounge.team;

import com.lucklounge.config.LuckLoungeProperties;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 서버가 처음 뜰 때 팀이 하나도 없으면 기본 팀을 만들고, 매번 시작할 때 팀 링크를 로그에 남긴다.
 * 운영 서버에서는 deploy/teams.sh 로도 링크를 확인할 수 있다.
 */
@Component
class TeamBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TeamBootstrap.class);

    private final TeamRepository teams;
    private final LuckLoungeProperties properties;
    private final Clock clock;

    TeamBootstrap(TeamRepository teams, LuckLoungeProperties properties, Clock clock) {
        this.teams = teams;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (teams.count() == 0) {
            String slug = TeamSlugs.generate();
            while (teams.existsBySlug(slug)) {
                slug = TeamSlugs.generate();
            }
            teams.save(new Team(slug, properties.defaultTeamName(), Instant.now(clock)));
            log.info("기본 팀을 만들었습니다: {}", properties.defaultTeamName());
        }
        List<Team> all = teams.findAll();
        for (Team team : all) {
            log.info("팀 링크 [{}] {}", team.getName(), properties.teamLink(team.getSlug()));
        }
    }
}
