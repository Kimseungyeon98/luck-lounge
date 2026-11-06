package com.lucklounge.record;

import static org.assertj.core.api.Assertions.assertThat;

import com.lucklounge.TestDatabaseConfiguration;
import com.lucklounge.player.JoinService;
import com.lucklounge.player.JoinService.JoinCommand;
import com.lucklounge.team.TeamRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
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
class StatsServiceTest {

    @Autowired
    StatsService stats;

    @Autowired
    GameRecords records;

    @Autowired
    JoinService joinService;

    @Autowired
    TeamRepository teams;

    @Autowired
    JdbcTemplate jdbc;

    String slug;
    UUID kim;
    UUID park;
    UUID lee;

    @BeforeEach
    void setUp() {
        jdbc.execute("truncate game_round_player, game_round, game_session, player_device, player cascade");
        slug = teams.findAll().getFirst().getSlug();
        kim = joinService.join(slug, null, new JoinCommand("김대리", 0, null)).playerId();
        park = joinService.join(slug, null, new JoinCommand("박과장", 1, null)).playerId();
        lee = joinService.join(slug, null, new JoinCommand("이팀장", 2, null)).playerId();
    }

    /** 이번 달 d일 아침 9시(한국) */
    Instant thisMonth(int day) {
        LocalDate date = YearMonth.now(ZoneId.of("Asia/Seoul")).atDay(day);
        return date.atTime(9, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant();
    }

    void play(Instant at, boolean practice, UUID loser, List<UUID> players) {
        long s = records.startSession(slug, "BOMB", 1, practice, 1, 0, at);
        records.saveRound(s, 1, loser, 1000, null, null, at.plusSeconds(30), players);
        records.endSession(s, at.plusSeconds(40));
    }

    @Test
    void 당첨_많은_순이고_참여는_하루_한_번_연습판은_제외() {
        List<UUID> all = List.of(kim, park, lee);
        play(thisMonth(1), false, park, all);
        play(thisMonth(1).plusSeconds(3600), false, park, all);  // 같은 날 두 번째 내기
        play(thisMonth(2), false, lee, List.of(park, lee));
        play(thisMonth(2).plusSeconds(600), true, kim, all);       // 연습판

        StatsService.Stats s = stats.stats(slug, "this");
        assertThat(s.days()).isEqualTo(2);
        assertThat(s.totalWins()).isEqualTo(3);
        assertThat(s.rows()).extracting(StatsService.Row::nickname).containsExactly("박과장", "이팀장", "김대리");
        assertThat(s.rows()).extracting(StatsService.Row::wins).containsExactly(2, 1, 0);
        assertThat(s.rows()).extracting(StatsService.Row::days).containsExactly(2, 2, 1);
    }

    @Test
    void 지난달과_전체() {
        Instant lastMonth = thisMonth(1).minusSeconds(86400 * 3);
        play(lastMonth, false, kim, List.of(kim, park));
        play(thisMonth(1), false, park, List.of(kim, park));

        assertThat(stats.stats(slug, "last").rows()).extracting(StatsService.Row::nickname).containsExactly("김대리", "박과장");
        assertThat(stats.stats(slug, "last").rows().getFirst().wins()).isEqualTo(1);
        assertThat(stats.stats(slug, "this").rows().getFirst().nickname()).isEqualTo("박과장");
        assertThat(stats.stats(slug, "all").totalWins()).isEqualTo(2);
        assertThat(stats.stats(slug, "all").rows()).allSatisfy(r -> assertThat(r.days()).isEqualTo(2));
    }
}
