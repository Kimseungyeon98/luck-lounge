package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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
}
