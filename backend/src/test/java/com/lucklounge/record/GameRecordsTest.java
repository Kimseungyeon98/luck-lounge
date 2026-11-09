package com.lucklounge.record;

import static org.assertj.core.api.Assertions.assertThat;

import com.lucklounge.TestDatabaseConfiguration;
import com.lucklounge.player.JoinService;
import com.lucklounge.player.JoinService.JoinCommand;
import com.lucklounge.team.TeamRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@Import(TestDatabaseConfiguration.class)
class GameRecordsTest {

    @Autowired
    GameRecords records;

    @Autowired
    JoinService joinService;

    @Autowired
    TeamRepository teams;

    @Autowired
    JdbcTemplate jdbc;

    String slug;

    @BeforeEach
    void setUp() {
        jdbc.execute("truncate game_round_player, game_round, game_session, player_device, player cascade");
        slug = teams.findAll().getFirst().getSlug();
    }

    @Test
    void 내기와_판별_당첨자를_저장하고_날짜는_한국_시간() {
        UUID kim = joinService.join(slug, null, new JoinCommand("김대리", 0, null)).playerId();
        UUID park = joinService.join(slug, null, new JoinCommand("박과장", 1, null)).playerId();
        UUID lee = joinService.join(slug, null, new JoinCommand("이팀장", 2, null)).playerId();
        // 한국 시간 11월 7일 아침 8시 50분 = UTC 11월 6일 23시 50분
        Instant at = Instant.parse("2026-11-06T23:50:00Z");

        long session = records.startSession(slug, "BOMB", 2, false, java.util.Map.of("BOMB", 2, "BALLOON", 1), at);
        records.saveRound(session, 1, park, 1200, null, null, at.plusSeconds(30), List.of(kim, park, lee));
        records.saveRound(session, 2, lee, 0, 19, 18, at.plusSeconds(60), List.of(kim, lee));
        records.endSession(session, at.plusSeconds(70));

        assertThat(jdbc.queryForObject("select play_date from game_session where id = ?", LocalDate.class, session))
                .isEqualTo(LocalDate.of(2026, 11, 7));
        assertThat(jdbc.queryForList("select loser_id from game_round where session_id = ? order by seq", UUID.class, session))
                .containsExactly(park, lee);
        assertThat(jdbc.queryForObject("select count(*) from game_round_player", Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("select pump_limit from game_round where seq = 2", Integer.class)).isEqualTo(18);
        assertThat(jdbc.queryForObject("select ended_at is not null from game_session where id = ?", Boolean.class, session)).isTrue();
    }
}
