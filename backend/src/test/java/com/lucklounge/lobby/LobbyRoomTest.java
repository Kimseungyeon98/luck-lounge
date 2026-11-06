package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LobbyRoomTest {

    final LobbyRoom room = new LobbyRoom("abcd2345");
    final UUID kim = UUID.randomUUID();
    final UUID park = UUID.randomUUID();
    final UUID lee = UUID.randomUUID();
    final Instant t0 = Instant.parse("2026-11-06T00:00:00Z");

    @Test
    void 먼저_온_사람이_방장이_된다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        assertThat(room.host()).contains(kim);
        assertThat(room.presence().players()).extracting(LobbyRoom.MemberView::nickname).containsExactly("김대리", "박과장");
    }

    @Test
    void 방장이_나가면_10초_뒤_다음으로_먼저_온_사람에게_넘어간다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        room.join("s3", lee, "이팀장", 2);
        room.leave("s1", t0);

        assertThat(room.tick(0.1, t0.plusSeconds(9)).presenceChanged()).isFalse();
        assertThat(room.host()).contains(kim);

        assertThat(room.tick(0.1, t0.plusSeconds(10)).presenceChanged()).isTrue();
        assertThat(room.host()).contains(park);
    }

    @Test
    void 방장이_10초_안에_돌아오면_그대로_방장() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        room.leave("s1", t0);
        room.join("s1b", kim, "김대리", 0);
        room.tick(0.1, t0.plusSeconds(30));
        assertThat(room.host()).contains(kim);
    }

    @Test
    void 방장만_넘길_수_있다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        assertThat(room.transferHost(park, kim)).isFalse();
        assertThat(room.transferHost(kim, park)).isTrue();
        assertThat(room.host()).contains(park);
    }

    @Test
    void 휴대폰_두_대_중_하나만_끊기면_나간_게_아니다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", kim, "김대리", 0);
        assertThat(room.leave("s1", t0)).isFalse();
        assertThat(room.presence().players()).hasSize(1);
        assertThat(room.leave("s2", t0)).isTrue();
        assertThat(room.presence().players()).isEmpty();
    }

    @Test
    void 목적지까지_걸어가고_도착하면_멈춘다() {
        room.join("s1", kim, "김대리", 0);
        room.moveTo(kim, 2.0, 4.4);
        for (int i = 0; i < 20; i++) {
            room.tick(0.1, t0);
        }
        LobbyRoom.PositionView p = room.positions().getFirst();
        assertThat(p.x()).isEqualTo(2.0);
        assertThat(p.z()).isEqualTo(4.4);
        assertThat(p.m()).isFalse();
    }

    @Test
    void 장애물을_통과하지_못한다() {
        room.join("s1", kim, "김대리", 0);
        // 테이블(-0.4, -2.4) 한가운데로 가려고 해도 테이블 밖에 멈춘다
        room.moveTo(kim, -0.4, -2.4);
        for (int i = 0; i < 100; i++) {
            room.tick(0.1, t0);
        }
        LobbyRoom.PositionView p = room.positions().getFirst();
        assertThat(Obstacles.blocked(p.x(), p.z())).isFalse();
        assertThat(Math.hypot(p.x() + 0.4, p.z() + 2.4)).isGreaterThanOrEqualTo(0.94);
    }

    @Test
    void 조이스틱_방향으로_걷고_0이면_멈춘다() {
        room.join("s1", kim, "김대리", 0);
        double startX = room.positions().getFirst().x();
        room.steer(kim, 1, 0);
        room.tick(0.5, t0);
        assertThat(room.positions().getFirst().x()).isCloseTo(startX + 1.2, org.assertj.core.data.Offset.offset(0.01));
        room.steer(kim, 0, 0);
        room.tick(0.1, t0);
        assertThat(room.positions().getFirst().m()).isFalse();
    }

    @Test
    void 말풍선은_1초에_한_번까지() {
        room.join("s1", kim, "김대리", 0);
        assertThat(room.allowChat(kim, t0)).isTrue();
        assertThat(room.allowChat(kim, t0.plusMillis(500))).isFalse();
        assertThat(room.allowChat(kim, t0.plusMillis(1000))).isTrue();
    }

    @Test
    void 자리비움은_움직이면_풀린다() {
        room.join("s1", kim, "김대리", 0);
        assertThat(room.setAway(kim, true)).isTrue();
        assertThat(room.presence().players().getFirst().away()).isTrue();
        room.moveTo(kim, 1, 4.4);
        room.tick(0.1, t0);
        assertThat(room.presence().players().getFirst().away()).isFalse();
    }

    // ---------- 내기: 투표 → 연속 판 ----------

    /** 이벤트를 모으며 시간을 1초씩 진행 */
    List<Match.Event> run(LobbyRoom r, int fromSec, int toSec) {
        List<Match.Event> all = new java.util.ArrayList<>();
        for (int s = fromSec; s <= toSec; s++) {
            all.addAll(r.tick(0.1, t0.plusSeconds(s)).matchEvents());
        }
        return all;
    }

    void standAt(LobbyRoom r, UUID id, double x, double z) {
        r.moveTo(id, x, z);
        for (int i = 0; i < 80; i++) {
            r.tick(0.1, t0);
        }
    }

    @Test
    void 게임_고르기는_방장만_2명_이상일_때_시작한다() {
        room.join("s1", kim, "김대리", 0);
        assertThat(room.startMatch(kim, 1, false, t0)).isEqualTo(LobbyRoom.StartFailure.NOT_ENOUGH_PLAYERS);
        room.join("s2", park, "박과장", 1);
        assertThat(room.startMatch(park, 1, false, t0)).isEqualTo(LobbyRoom.StartFailure.NOT_HOST);
        assertThat(room.startMatch(kim, 1, false, t0)).isInstanceOf(Match.VoteStarted.class);
        assertThat(room.startMatch(kim, 1, false, t0)).isEqualTo(LobbyRoom.StartFailure.ALREADY_RUNNING);
    }

    @Test
    void 부스_위_인원으로_투표하고_부스_밖_사람도_게임에_참가한다() {
        LobbyRoom r = new LobbyRoom("abcd2345", new java.util.Random(1));
        r.join("s1", kim, "김대리", 0);
        r.join("s2", park, "박과장", 1);
        r.join("s3", lee, "이팀장", 2);
        standAt(r, kim, -3.0, 3.6);   // 시한폭탄 부스 (받침 앞쪽)
        standAt(r, park, -2.0, 2.6);  // 시한폭탄 부스 가장자리
        standAt(r, lee, 0.0, 0.0);    // 부스 밖 → 기권
        r.startMatch(kim, 1, false, t0);

        List<Match.Event> events = run(r, 1, 10);
        Match.VoteEnded vote = (Match.VoteEnded) events.stream().filter(e -> e instanceof Match.VoteEnded).findFirst().orElseThrow();
        assertThat(vote.bomb()).isEqualTo(2);
        assertThat(vote.balloon()).isZero();
        assertThat(vote.abstain()).isEqualTo(1);
        assertThat(vote.won()).isEqualTo(Match.Booth.BOMB);
        assertThat(vote.participants()).containsExactlyInAnyOrder(kim, park, lee);
    }

    @Test
    void 풍선이_이겨도_시한폭탄으로_진행한다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        standAt(room, kim, 3.0, 3.6);
        room.startMatch(kim, 1, false, t0);
        List<Match.Event> events = run(room, 1, 20);
        Match.VoteEnded vote = (Match.VoteEnded) events.stream().filter(e -> e instanceof Match.VoteEnded).findFirst().orElseThrow();
        assertThat(vote.won()).isEqualTo(Match.Booth.BALLOON);
        assertThat(vote.gameType()).isEqualTo("BOMB");
        assertThat(events).anyMatch(e -> e instanceof Match.RoundStarted);
    }

    @Test
    void 당첨자_수만큼_연속으로_하고_같은_사람은_두_번_당첨되지_않는다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        room.join("s3", lee, "이팀장", 2);
        room.startMatch(kim, 2, false, t0);
        List<Match.Event> events = run(room, 1, 200);

        List<Match.RoundEnded> rounds = events.stream().filter(e -> e instanceof Match.RoundEnded).map(e -> (Match.RoundEnded) e).toList();
        assertThat(rounds).hasSize(2);
        assertThat(rounds.get(0).loser()).isNotEqualTo(rounds.get(1).loser());
        assertThat(rounds.get(0).more()).isTrue();
        assertThat(rounds.get(1).more()).isFalse();
        assertThat(rounds.get(1).players()).doesNotContain(rounds.get(0).loser());

        Match.Summary summary = (Match.Summary) events.stream().filter(e -> e instanceof Match.Summary).findFirst().orElseThrow();
        assertThat(summary.winners()).hasSize(2);
        assertThat(events.getLast()).isInstanceOf(Match.Finished.class);
        assertThat(room.roundInProgress()).isEmpty();
    }

    @Test
    void 당첨자_수는_참가자보다_적게_맞춘다() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        room.startMatch(kim, 3, false, t0);
        Match.VoteEnded vote = (Match.VoteEnded) run(room, 1, 10).stream().filter(e -> e instanceof Match.VoteEnded).findFirst().orElseThrow();
        assertThat(vote.winnersTarget()).isEqualTo(1);
    }

    @Test
    void 투표_중에는_걷고_게임이_시작되면_제자리() {
        room.join("s1", kim, "김대리", 0);
        room.join("s2", park, "박과장", 1);
        room.startMatch(kim, 1, false, t0);
        room.moveTo(kim, 2.0, 4.4);
        room.tick(0.1, t0.plusMillis(100));
        assertThat(room.positions().stream().filter(p -> p.id().equals(kim)).findFirst().orElseThrow().m()).isTrue();

        run(room, 1, 14); // 투표 끝 + 발표 3초 → 1판 시작
        assertThat(room.roundInProgress()).isPresent();
        var before = room.positions().stream().filter(p -> p.id().equals(kim)).findFirst().orElseThrow();
        assertThat(Math.hypot(before.x() - LobbyRoom.BOMB_CENTER_X, before.z() - LobbyRoom.BOMB_CENTER_Z)).isCloseTo(1.6, org.assertj.core.data.Offset.offset(0.01));
        room.moveTo(kim, 3, 4);
        room.tick(0.5, t0.plusSeconds(15));
        var after = room.positions().stream().filter(p -> p.id().equals(kim)).findFirst().orElseThrow();
        assertThat(after.x()).isEqualTo(before.x());
    }
}
