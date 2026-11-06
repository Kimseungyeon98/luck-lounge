package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import com.lucklounge.lobby.BalloonGame.Popped;
import com.lucklounge.lobby.BalloonGame.PumpResult;
import com.lucklounge.lobby.BalloonGame.Pumped;
import com.lucklounge.lobby.BalloonGame.Turn;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BalloonGameTest {

    final UUID a = UUID.randomUUID();
    final UUID b = UUID.randomUUID();
    final UUID c = UUID.randomUUID();
    final Instant t0 = Instant.parse("2026-11-06T00:00:00Z");

    BalloonGame game(int limit) {
        return BalloonGame.fixed(List.of(a, b, c), 0, limit, t0);
    }

    static boolean always(UUID id) {
        return true;
    }

    @Test
    void 내_차례에만_1에서_3번까지_펌프질한다() {
        BalloonGame g = game(20);
        assertThat(g.pump(b, 1, t0)).isEqualTo(PumpResult.NOT_YOUR_TURN);
        assertThat(g.pump(a, 4, t0)).isEqualTo(PumpResult.INVALID);
        assertThat(g.pump(a, 0, t0)).isEqualTo(PumpResult.INVALID);
        assertThat(g.pump(a, 3, t0)).isEqualTo(PumpResult.PUMPED);
        assertThat(g.count()).isEqualTo(3);
        assertThat(g.turn()).isEqualTo(b);
        assertThat(g.advanceTo(t0, BalloonGameTest::always)).containsExactly(new Pumped(a, 3, 3, false), new Turn(b));
    }

    @Test
    void 한계를_넘기는_펌프질을_한_사람이_당첨() {
        BalloonGame g = game(4);
        g.pump(a, 3, t0);
        g.pump(b, 3, t0);   // 3 → 5 : 한계 4를 넘김
        List<BalloonGame.Event> events = g.advanceTo(t0, BalloonGameTest::always);
        assertThat(events).endsWith(new Pumped(b, 2, 5, false), new Popped(b, 5, 4));
        assertThat(g.outcome().loser()).isEqualTo(b);
        assertThat(g.outcome().pumpCount()).isEqualTo(5);
        assertThat(g.pump(c, 1, t0)).isEqualTo(PumpResult.OVER);
    }

    @Test
    void 정확히_한계까지는_안전하다() {
        BalloonGame g = game(3);
        g.pump(a, 3, t0);
        assertThat(g.outcome()).isNull();
        g.pump(b, 1, t0);
        assertThat(g.outcome().loser()).isEqualTo(b);
    }

    @Test
    void 칠초_안에_안_고르면_1번_자동() {
        BalloonGame g = game(20);
        assertThat(g.advanceTo(t0.plusMillis(6900), BalloonGameTest::always)).isEmpty();
        assertThat(g.advanceTo(t0.plusSeconds(7), BalloonGameTest::always)).containsExactly(new Pumped(a, 1, 1, true), new Turn(b));
        // 틱이 늦어도 7초 간격으로 순서대로 처리
        assertThat(g.advanceTo(t0.plusSeconds(21), BalloonGameTest::always))
                .containsExactly(new Pumped(b, 1, 2, true), new Turn(c), new Pumped(c, 1, 3, true), new Turn(a));
    }

    @Test
    void 차례인_사람이_나가면_바로_1번_자동() {
        BalloonGame g = game(20);
        Set<UUID> online = Set.of(b, c);
        assertThat(g.advanceTo(t0.plusSeconds(1), online::contains)).containsExactly(new Pumped(a, 1, 1, true), new Turn(b));
    }

    @Test
    void 한계는_12에서_30_사이() {
        Random random = new Random(7);
        for (int i = 0; i < 300; i++) {
            BalloonGame g = BalloonGame.start(List.of(a, b, c), t0, random);
            while (g.outcome() == null) {
                g.pump(g.turn(), 3, t0);
            }
            assertThat(g.outcome().pumpLimit()).isBetween(12, 30);
        }
    }
}
