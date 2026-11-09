package com.lucklounge.record;

import com.lucklounge.web.BadRequestException;
import com.lucklounge.web.NotFoundException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 통계 게시판: 기간별 당첨 횟수와 참여 일수.
 * <ul>
 *   <li>연습판은 빼고 센다</li>
 *   <li>참여는 같은 날 여러 번 해도 하루 1번</li>
 *   <li>당첨 많은 순, 같으면 참여 많은 순, 같으면 이름순</li>
 * </ul>
 */
@Service
public class StatsService {

    public record Row(UUID playerId, String nickname, int characterIndex, int wins, int days) {
    }

    public record Stats(String period, String label, int days, int totalWins, List<Row> rows) {
    }

    /** 경쟁 게임 하나의 최고 기록. lowerBetter: 10초 멈추기처럼 작을수록 좋은지 */
    public record GameBest(String gameType, boolean lowerBetter, GameRecords.Best team, GameRecords.Best mine) {
    }

    /** 경쟁 존 게임과 점수 방향 (lobby.SkillGame.Kind 와 같게) */
    private static final java.util.Map<String, Boolean> SKILL_GAMES = new java.util.LinkedHashMap<>();

    static {
        SKILL_GAMES.put("STOP", true);
        SKILL_GAMES.put("TOWER", false);
        SKILL_GAMES.put("TARGET", true);
    }

    private final JdbcClient jdbc;
    private final Clock clock;
    private final GameRecords records;

    StatsService(JdbcClient jdbc, Clock clock, GameRecords records) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.records = records;
    }

    @Transactional(readOnly = true)
    public List<GameBest> bests(String slug, UUID playerId) {
        jdbc.sql("select id from team where slug = :slug").param("slug", slug).query(Long.class)
                .optional().orElseThrow(() -> new NotFoundException("없는 팀 링크예요. 링크를 다시 확인해 주세요."));
        return SKILL_GAMES.entrySet().stream().map(e -> {
            GameRecords.Bests b = records.bests(slug, e.getKey(), e.getValue(), playerId);
            return new GameBest(e.getKey(), e.getValue(), b.team(), b.mine());
        }).toList();
    }

    @Transactional(readOnly = true)
    public Stats stats(String slug, String period) {
        long teamId = jdbc.sql("select id from team where slug = :slug").param("slug", slug).query(Long.class)
                .optional().orElseThrow(() -> new NotFoundException("없는 팀 링크예요. 링크를 다시 확인해 주세요."));
        YearMonth thisMonth = YearMonth.from(LocalDate.now(clock.withZone(GameRecords.KOREA)));
        LocalDate from;
        LocalDate to;
        String label;
        switch (period == null ? "this" : period) {
            case "this" -> {
                from = thisMonth.atDay(1);
                to = thisMonth.atEndOfMonth();
                label = thisMonth.getMonthValue() + "월";
            }
            case "last" -> {
                YearMonth last = thisMonth.minusMonths(1);
                from = last.atDay(1);
                to = last.atEndOfMonth();
                label = last.getMonthValue() + "월";
            }
            case "all" -> {
                from = LocalDate.of(2000, 1, 1);
                to = LocalDate.of(2999, 12, 31);
                label = "전체";
            }
            default -> throw new BadRequestException("기간은 this, last, all 중 하나예요.");
        }

        List<Row> rows = jdbc.sql("""
                        with sessions as (
                            select id, play_date from game_session
                            where team_id = :team and not practice and play_date between :from and :to
                        ),
                        days as (
                            select rp.player_id, count(distinct s.play_date) as days
                            from game_round_player rp
                            join game_round r on r.id = rp.round_id
                            join sessions s on s.id = r.session_id
                            group by rp.player_id
                        ),
                        wins as (
                            select r.loser_id as player_id, count(*) as wins
                            from game_round r
                            join sessions s on s.id = r.session_id
                            group by r.loser_id
                        )
                        select p.id, p.nickname, p.character_index, coalesce(w.wins, 0) as wins, d.days
                        from days d
                        join player p on p.id = d.player_id
                        left join wins w on w.player_id = d.player_id
                        order by wins desc, d.days desc, p.nickname
                        """)
                .param("team", teamId)
                .param("from", from)
                .param("to", to)
                .query((rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getString("nickname"),
                        rs.getInt("character_index"), rs.getInt("wins"), rs.getInt("days")))
                .list();

        int sessionDays = jdbc.sql("""
                        select count(distinct play_date) from game_session
                        where team_id = :team and not practice and play_date between :from and :to
                        """)
                .param("team", teamId).param("from", from).param("to", to)
                .query(Integer.class).single();
        int totalWins = rows.stream().mapToInt(Row::wins).sum();
        return new Stats(period == null ? "this" : period, label, sessionDays, totalWins, rows);
    }
}
