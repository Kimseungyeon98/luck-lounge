package com.lucklounge.record;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
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

    @Transactional
    public long startSession(String teamSlug, String gameType, int winnersTarget, boolean practice,
                             int voteBomb, int voteBalloon, Instant startedAt) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.sql("""
                        insert into game_session (team_id, play_date, game_type, winners_target, practice,
                                                  vote_bomb, vote_balloon, started_at)
                        select id, :date, :type, :target, :practice, :bomb, :balloon, :at from team where slug = :slug
                        """)
                .param("date", LocalDate.ofInstant(startedAt, KOREA))
                .param("type", gameType)
                .param("target", winnersTarget)
                .param("practice", practice)
                .param("bomb", voteBomb)
                .param("balloon", voteBalloon)
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

    @Transactional
    public void endSession(long sessionId, Instant endedAt) {
        jdbc.sql("update game_session set ended_at = :at where id = :id")
                .param("at", Timestamp.from(endedAt))
                .param("id", sessionId)
                .update();
    }
}
