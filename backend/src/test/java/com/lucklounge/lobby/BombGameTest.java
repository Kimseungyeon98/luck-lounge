package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import com.lucklounge.lobby.BombGame.Exploded;
import com.lucklounge.lobby.BombGame.HolderChanged;
import com.lucklounge.lobby.BombGame.PassResult;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BombGameTest {

    final UUID a = UUID.randomUUID();
    final UUID b = UUID.randomUUID();
    final UUID c = UUID.randomUUID();
    final Instant t0 = Instant.parse("2026-11-06T00:00:00Z");

    BombGame game(Duration fuse) {
        return BombGame.fixed(List.of(a, b, c), 0, t0, fuse);
    }

    static boolean always(UUID id) {
        return true;
    }

    @Test
    void 받고_1초_전에는_넘길_수_없다() {
        BombGame g = game(Duration.ofSeconds(30));
        assertThat(g.pass(a, t0.plusMillis(500))).isEqualTo(PassResult.TOO_EARLY);
        assertThat(g.pass(b, t0.plusMillis(1200))).isEqualTo(PassResult.NOT_HOLDER);
        assertThat(g.pass(a, t0.plusMillis(1200))).isEqualTo(PassResult.PASSED);
        assertThat(g.holder()).isEqualTo(b);
    }

    @Test
    void 오초가_지나면_자동으로_넘어간다() {
        BombGame g = game(Duration.ofSeconds(30));
        assertThat(g.advanceTo(t0.plusMillis(4900), BombGameTest::always)).isEmpty();
        assertThat(g.advanceTo(t0.plusSeconds(5), BombGameTest::always)).containsExactly(new HolderChanged(b, true));
    }

    @Test
    void 숨은_시간이_끝날_때_들고_있던_사람이_당첨() {
        BombGame g = game(Duration.ofSeconds(7));
        g.advanceTo(t0.plusSeconds(5), BombGameTest::always);
        List<BombGame.Event> events = g.advanceTo(t0.plusSeconds(7), BombGameTest::always);
        assertThat(events).containsExactly(new Exploded(b, 2000));
    }

    @Test
    void 틱이_늦게_와도_일어났어야_할_순서대로_처리한다() {
        BombGame g = game(Duration.ofSeconds(11));
        List<BombGame.Event> events = g.advanceTo(t0.plusSeconds(12), BombGameTest::always);
        assertThat(events).containsExactly(new HolderChanged(b, true), new HolderChanged(c, true), new Exploded(c, 1000));
    }

    @Test
    void 폭발_시각_이후에_도착한_넘기기는_무효() {
        BombGame g = game(Duration.ofSeconds(3));
        assertThat(g.pass(a, t0.plusMillis(3001))).isEqualTo(PassResult.OVER);
        assertThat(g.advanceTo(t0.plusMillis(3100), BombGameTest::always)).containsExactly(new Exploded(a, 3000));
    }

    @Test
    void 폭발_직전에_도착한_넘기기는_유효() {
        BombGame g = game(Duration.ofSeconds(3));
        assertThat(g.pass(a, t0.plusMillis(2999))).isEqualTo(PassResult.PASSED);
        assertThat(g.advanceTo(t0.plusMillis(3100), BombGameTest::always)).containsExactly(new Exploded(b, 1));
    }

    @Test
    void 연결이_끊긴_사람이_들고_있으면_바로_넘어간다() {
        BombGame g = game(Duration.ofSeconds(30));
        Set<UUID> online = Set.of(a, c);
        g.pass(a, t0.plusSeconds(2));
        assertThat(g.advanceTo(t0.plusMillis(2100), online::contains)).containsExactly(new HolderChanged(c, true));
    }

    @Test
    void 결과를_보여_준_뒤_끝난다() {
        BombGame g = game(Duration.ofSeconds(2));
        g.advanceTo(t0.plusSeconds(2), BombGameTest::always);
        assertThat(g.advanceTo(t0.plusSeconds(7), BombGameTest::always)).isEmpty();
        assertThat(g.advanceTo(t0.plusSeconds(8), BombGameTest::always)).containsExactly(new BombGame.Finished());
    }

    @Test
    void 숨은_시간은_15초에서_40초_사이() {
        Random random = new Random(42);
        for (int i = 0; i < 200; i++) {
            BombGame g = BombGame.start(List.of(a, b, c), t0, random);
            Duration fuse = Duration.between(t0, g.explodeAt());
            assertThat(fuse).isBetween(Duration.ofSeconds(15), Duration.ofSeconds(40));
            assertThat(g.order()).containsExactlyInAnyOrder(a, b, c);
        }
    }
}
