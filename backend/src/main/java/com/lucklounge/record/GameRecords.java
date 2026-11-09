package com.lucklounge.record;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * 내기 기록 저장. 게임 중에는 DB를 건드리지 않고, 투표가 끝날 때와 판이 끝날 때만 쓴다.
 * 날짜는 한국 시간 기준 (아침 내기가 UTC로 전날이 되지 않게).
 */
@Repository
public class GameRecords {

    public static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

    private final JdbcClient jdbc;

    GameRecords(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** @param votes 부스 이름(BOMB, BALLOON, STOP, TOWER) → 그 부스에 선 사람 수 */
    @Transactional
    public long startSession(String teamSlug, String gameType, int winnersTarget, boolean practice,
                             Map<String, Integer> votes, Instant startedAt) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.sql("""
                        insert into game_session (team_id, play_date, game_type, winners_target, practice,
                                                  vote_bomb, vote_balloon, vote_stop, vote_tower, started_at)
                        select id, :date, :type, :target, :practice, :bomb, :balloon, :stop, :tower, :at
                        from team where slug = :slug
                        """)
                .param("date", LocalDate.ofInstant(startedAt, KOREA))
                .param("type", gameType)
                .param("target", winnersTarget)
                .param("practice", practice)
                .param("bomb", votes.getOrDefault("BOMB", 0))
                .param("balloon", votes.getOrDefault("BALLOON", 0))
                .param("stop", votes.getOrDefault("STOP", 0))
                .param("tower", votes.getOrDefault("TOWER", 0))
                .param("at", Timestamp.from(startedAt))
                .param("slug", teamSlug)
                .update(keys, "id");
        return keys.getKeyAs(Long.class);
    }

    @Transactional
    public void saveRound(long sessionId, int seq, UUID loserId, long heldMs, Integer pumpCount, Integer pumpLimit,
                          Instant endedAt, List<UUID> players) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.sql("""
                        insert into game_round (session_id, seq, loser_id, held_ms, pump_count, pump_limit, ended_at)
                        values (:session, :seq, :loser, :held, :pumpCount, :pumpLimit, :at)
                        """)
                .param("session", sessionId)
                .param("seq", seq)
                .param("loser", loserId)
                .param("held", heldMs)
                .param("pumpCount", pumpCount, java.sql.Types.INTEGER)
                .param("pumpLimit", pumpLimit, java.sql.Types.INTEGER)
                .param("at", Timestamp.from(endedAt))
                .update(keys, "id");
        long roundId = keys.getKeyAs(Long.class);
        for (UUID p : players) {
            jdbc.sql("insert into game_round_player (round_id, player_id) values (:round, :player)")
                    .param("round", roundId)
                    .param("player", p)
                    .update();
        }
    }

    /** 경쟁 게임 점수 한 개. sessionId 가 null 이면 혼자 연습 */
    public record SkillScore(UUID playerId, double score, Double extra) {
    }

    @Transactional
    public void saveSkillScores(String teamSlug, Long sessionId, String gameType, List<SkillScore> scores, Instant at) {
        for (SkillScore sc : scores) {
            jdbc.sql("""
                            insert into skill_score (team_id, player_id, game_type, score, extra, solo, session_id, played_at)
                            select id, :player, :type, :score, :extra, :solo, :session, :at from team where slug = :slug
                            """)
                    .param("player", sc.playerId())
                    .param("type", gameType)
                    .param("score", sc.score())
                    .param("extra", sc.extra(), java.sql.Types.DOUBLE)
                    .param("solo", sessionId == null)
                    .param("session", sessionId, java.sql.Types.BIGINT)
                    .param("at", Timestamp.from(at))
                    .param("slug", teamSlug)
                    .update();
        }
    }

    /** 최고 기록 한 줄 */
    public record Best(UUID playerId, String nickname, int characterIndex, double score, Double extra) {
    }

    /** 팀 최고 기록과 내 최고 기록 (내기 + 연습 모두). lowerBetter 면 작은 점수가 좋음 */
    @Transactional(readOnly = true)
    public Bests bests(String teamSlug, String gameType, boolean lowerBetter, UUID playerId) {
        String order = lowerBetter ? "s.score asc, s.played_at asc" : "s.score desc, s.extra desc nulls last, s.played_at asc";
        String base = """
                select s.player_id, p.nickname, p.character_index, s.score, s.extra
                from skill_score s
                join team t on t.id = s.team_id
                join player p on p.id = s.player_id
                where t.slug = :slug and s.game_type = :type
                """;
        RowMapperBest mapper = new RowMapperBest();
        Best team = jdbc.sql(base + " order by " + order + " limit 1")
                .param("slug", teamSlug).param("type", gameType)
                .query(mapper).optional().orElse(null);
        Best mine = playerId == null ? null : jdbc.sql(base + " and s.player_id = :player order by " + order + " limit 1")
                .param("slug", teamSlug).param("type", gameType).param("player", playerId)
                .query(mapper).optional().orElse(null);
        return new Bests(team, mine);
    }

    public record Bests(Best team, Best mine) {
    }

    private static final class RowMapperBest implements org.springframework.jdbc.core.RowMapper<Best> {
        @Override
        public Best mapRow(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
            double extra = rs.getDouble("extra");
            return new Best(rs.getObject("player_id", UUID.class), rs.getString("nickname"), rs.getInt("character_index"),
                    rs.getDouble("score"), rs.wasNull() ? null : extra);
        }
    }

    @Transactional
    public void endSession(long sessionId, Instant endedAt) {
        jdbc.sql("update game_session set ended_at = :at where id = :id")
                .param("at", Timestamp.from(endedAt))
                .param("id", sessionId)
                .update();
    }
}
