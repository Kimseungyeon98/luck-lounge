package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LadderGameTest {

    final UUID a = UUID.randomUUID();
    final UUID b = UUID.randomUUID();
    final UUID c = UUID.randomUUID();
    final Instant t0 = Instant.parse("2026-11-09T00:00:00Z");

    static boolean always(UUID id) {
        return true;
    }

    @Test
    void 가로줄을_따라_내려가_커피_칸에_닿은_사람이_당첨() {
        // 0층에서 0-1 을, 1층에서 1-2 를 잇는다: 0 → 1 → 2, 1 → 0 → 0, 2 → 2 → 1
        LadderGame g = LadderGame.fixed(List.of(a, b, c), t0, List.of(new int[]{0, 0}, new int[]{1, 1}), 2);
        assertThat(g.endOf(0)).isEqualTo(2);
        assertThat(g.endOf(1)).isZero();
        assertThat(g.endOf(2)).isEqualTo(1);
        g.pick(a, 1, t0);
        g.pick(b, 0, t0);   // b 가 0번 줄 → 2번 칸 (☕)
        g.pick(c, 2, t0);
        List<? extends PartyGame.GameEvent> events = g.advanceTo(t0, LadderGameTest::always);
        LadderGame.Revealed r = (LadderGame.Revealed) events.getLast();
        assertThat(r.loser()).isEqualTo(b);
        assertThat(r.loserStart()).isZero();
        assertThat(g.outcome()).isNull();
        g.advanceTo(t0.plus(LadderGame.REVEAL_TIME), LadderGameTest::always);
        assertThat(g.outcome().loser()).isEqualTo(b);
    }

    @Test
    void 이미_고른_줄과_두_번_고르기는_안_되고_시간이_지나면_남은_줄을_무작위로() {
        LadderGame g = LadderGame.start(List.of(a, b, c), t0, new Random(3));
        assertThat(g.pick(a, 1, t0)).isEqualTo(LadderGame.PickResult.PICKED);
        assertThat(g.pick(b, 1, t0)).isEqualTo(LadderGame.PickResult.TAKEN);
        assertThat(g.pick(a, 2, t0)).isEqualTo(LadderGame.PickResult.ALREADY);
        assertThat(g.pick(b, 7, t0)).isEqualTo(LadderGame.PickResult.INVALID);
        assertThat(g.advanceTo(t0.plusSeconds(5), LadderGameTest::always)).noneMatch(e -> e instanceof LadderGame.Revealed);
        List<? extends PartyGame.GameEvent> events = g.advanceTo(t0.plus(LadderGame.PICK_TIME), LadderGameTest::always);
        assertThat(events).filteredOn(e -> e instanceof LadderGame.Picked p && p.auto()).hasSize(2);
        LadderGame.Revealed r = (LadderGame.Revealed) events.getLast();
        assertThat(r.picks()).hasSize(3).containsValues(a, b, c);
        assertThat(g.pick(c, 0, t0.plusSeconds(11))).isEqualTo(LadderGame.PickResult.OVER);
    }

    @Test
    void 나간_사람은_기다리지_않는다() {
        LadderGame g = LadderGame.start(List.of(a, b), t0, new Random(1));
        g.pick(a, 0, t0);
        List<? extends PartyGame.GameEvent> events = g.advanceTo(t0.plusSeconds(1), id -> !id.equals(b));
        assertThat(events.getLast()).isInstanceOf(LadderGame.Revealed.class);
    }
}
